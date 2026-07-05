import type { Prisma, PrismaClient } from "@wealthos/db";
import { createItemInTx, documentsRepo, fileStore } from "@wealthos/db";
import {
  buildFromPayload,
  RawDataPayloadSchema,
  validateOwnershipShares,
  type CanonicalAccountDraft,
  type RawDataPayload,
} from "@wealthos/domain";
import { findAdapter, type DocumentMeta } from "@wealthos/ingestion";

export interface ImportRequest {
  documentId: string;
  adapterId?: string | undefined;
  /** Ownership applied to every created item; human-confirmed at import time. */
  defaultOwnership: { familyMemberId: string; sharePct: string }[];
}

export interface ImportReport {
  batchId: string;
  adapterId: string;
  adapterVersion: string;
  created: { itemId: string; name: string }[];
  updated: { itemId: string; name: string }[]; // re-import matched an existing item → valuation appended
  suspense: { reason: string }[];
  warnings: string[];
  provenanceFields: number;
}

export class ImportError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
  }
}

/**
 * The import pipeline: document bytes → adapter → RawDataPayload (validated) →
 * LedgerFactory → atomic persistence with per-field provenance and suspense routing.
 * A failed batch leaves no partial ledger writes (single transaction).
 *
 * Re-import matching rule (deterministic): an ACCOUNT draft with an externalRef that
 * matches an existing ACTIVE account at the same institution appends a valuation to
 * that item instead of duplicating it.
 */
export async function runImport(
  db: PrismaClient,
  householdId: string,
  request: ImportRequest,
): Promise<ImportReport> {
  const ownership = validateOwnershipShares(request.defaultOwnership);
  if (!ownership.valid) throw new ImportError(ownership.reason);

  const document = await documentsRepo.get(db, request.documentId);
  if (!document) throw new ImportError("DOCUMENT_NOT_FOUND");

  const meta: DocumentMeta = {
    filename: document.filename,
    mimeType: document.mimeType,
    docType: document.docType ?? undefined,
    institutionName: document.institution?.name,
    sha256: document.sha256,
  };
  const adapter = findAdapter(request.adapterId ?? meta);
  if (!adapter) throw new ImportError("NO_ADAPTER_FOUND");

  const bytes = await fileStore().get(document.storageKey);

  let payload: RawDataPayload;
  const batch = await db.importBatch.create({
    data: {
      documentId: document.id,
      adapterId: adapter.id,
      adapterVersion: adapter.version,
      status: "RUNNING",
      rawPayload: {},
    },
  });
  try {
    const parsed = await adapter.parse(bytes, meta);
    payload = RawDataPayloadSchema.parse(parsed);
  } catch (e) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", finishedAt: new Date() },
    });
    await documentsRepo.setParseStatus(db, document.id, "FAILED");
    throw new ImportError("ADAPTER_PARSE_FAILED", e instanceof Error ? e.message : undefined);
  }

  const result = buildFromPayload(payload);
  const report: ImportReport = {
    batchId: batch.id,
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    created: [],
    updated: [],
    suspense: [],
    warnings: payload.warnings,
    provenanceFields: 0,
  };

  await db.$transaction(async (tx) => {
    await tx.importBatch.update({
      where: { id: batch.id },
      data: { rawPayload: payload as unknown as Prisma.InputJsonValue },
    });

    for (const draft of result.canonical) {
      const { itemId, valuationId, isNew } = await persistAccountDraft(
        tx, householdId, draft, request.defaultOwnership,
      );
      for (const p of draft.provenance) {
        await tx.importedField.create({
          data: {
            batchId: batch.id,
            ledgerItemId: itemId,
            valuationId: valuationId ?? null,
            fieldPath: p.fieldPath,
            originalValue: p.originalValue,
            originalCurrency: p.originalCurrency ?? null,
            confidence: p.confidence,
          },
        });
        report.provenanceFields += 1;
      }
      (isNew ? report.created : report.updated).push({ itemId, name: draft.name });
    }

    for (const s of result.suspense) {
      await tx.suspenseItem.create({
        data: {
          batchId: batch.id,
          rawData: s.rawItem as unknown as Prisma.InputJsonValue,
          reason: s.reason,
        },
      });
      report.suspense.push({ reason: s.reason });
    }

    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });
  });

  const parseStatus =
    result.canonical.length > 0 && result.suspense.length > 0
      ? "PARTIALLY_PARSED"
      : result.canonical.length > 0 || result.suspense.length === 0
        ? "PARSED"
        : "PARTIALLY_PARSED";
  await documentsRepo.setParseStatus(db, document.id, parseStatus);

  return report;
}

async function persistAccountDraft(
  tx: Prisma.TransactionClient,
  householdId: string,
  draft: CanonicalAccountDraft,
  ownership: { familyMemberId: string; sharePct: string }[],
): Promise<{ itemId: string; valuationId: string | undefined; isNew: boolean }> {
  const institution = await tx.institution.upsert({
    where: { name_country: { name: draft.institutionName, country: "IL" } },
    create: { name: draft.institutionName, country: "IL", type: "PENSION_COMPANY" },
    update: {},
  });

  // Re-import match: same externalRef + institution + active → append valuation.
  if (draft.externalRef) {
    const existing = await tx.ledgerItem.findFirst({
      where: {
        householdId,
        kind: "ACCOUNT",
        status: "ACTIVE",
        accountDetail: { institutionId: institution.id, accountNumberMasked: draft.externalRef },
      },
    });
    if (existing) {
      let valuationId: string | undefined;
      if (draft.valuation) {
        const v = await tx.valuation.create({
          data: {
            ledgerItemId: existing.id,
            asOf: new Date(draft.valuation.asOf),
            value: draft.valuation.value,
            currency: draft.currency,
            source: "DOCUMENT_IMPORT",
            confidence: draft.valuation.confidence,
          },
        });
        valuationId = v.id;
      }
      return { itemId: existing.id, valuationId, isNew: false };
    }
  }

  const { itemId, valuationId } = await createItemInTx(
    tx,
    householdId,
    { kind: "ACCOUNT", name: draft.name, currency: draft.currency, ownership },
    draft.valuation
      ? {
          asOf: new Date(draft.valuation.asOf),
          value: draft.valuation.value,
          currency: draft.currency,
          source: "DOCUMENT_IMPORT",
          confidence: draft.valuation.confidence,
        }
      : undefined,
    async (txc, id) => {
      await txc.accountDetail.create({
        data: {
          ledgerItemId: id,
          institutionId: institution.id,
          accountType: draft.accountType,
          accountNumberMasked: draft.externalRef ?? null,
          trackName: draft.trackName ?? null,
          managementFeePct: draft.managementFeePct ?? null,
          depositFeePct: draft.depositFeePct ?? null,
        },
      });
    },
  );
  return { itemId, valuationId, isNew: true };
}
