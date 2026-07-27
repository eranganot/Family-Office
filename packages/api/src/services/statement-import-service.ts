import type { PrismaClient } from "@wealthos/db";
import { fileStore } from "@wealthos/db";
import {
  applyMapping, decodeBytes, detectHeaderRow, guessMapping, normaliseGrid, parseCsvGrid,
  parseHtmlGrid, REDACTION_VERSION, sniffFormat, toRecords,
  type MappingProfile, type TransactionDraft,
} from "@wealthos/ingestion";

/**
 * Statement (transaction-level) import.
 *
 * Deliberately separate from `import-service.ts`, which handles the M2 ledger-item
 * ingestion path (RawDataPayload -> LedgerFactory -> LedgerItem). This one produces
 * `Transaction` rows: the OBSERVATION layer (owner decision D5). The two never share a
 * pipeline, because a transaction must never become a ledger item by accident.
 */

export interface ImportPreview {
  format: string;
  encoding: string;
  /** Set when the file cannot be read; the UI turns this into actionable guidance. */
  unsupportedReason?: string | undefined;
  headers: string[];
  headerRowIndex: number;
  guessedMapping: Record<string, unknown>;
  sampleRows: Array<Record<string, string>>;
  totalRows: number;
  drafts: TransactionDraft[];
  issues: Array<{ rowIndex: number; reason: string; raw: string }>;
  /** How many drafts already exist in the DB, by externalRef. */
  duplicates: number;
  /** Count of PII fields the redactor removed, for the security summary. */
  redactedFields: number;
  redactionVersion: string;
  detectedRange?: { start: string; end: string; days: number } | undefined;
}

async function loadFile(db: PrismaClient, documentId: string) {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("DOCUMENT_NOT_FOUND");
  const bytes = await fileStore().get(doc.storageKey);
  return { doc, bytes, sniff: sniffFormat(bytes, doc.filename) };
}

function buildTable(bytes: Uint8Array, format: string, encoding: "utf-8" | "windows-1255") {
  const text = decodeBytes(bytes, encoding);
  const grid = normaliseGrid(format === "HTML" ? parseHtmlGrid(text) : parseCsvGrid(text));
  const headerRowIndex = detectHeaderRow(grid.rows);
  return { table: toRecords(grid, headerRowIndex), headerRowIndex };
}

function defaultProfile(headers: string[]): MappingProfile {
  const g = guessMapping(headers);
  return {
    amountMode: g.amountMode,
    defaultCurrency: "ILS",
    dayFirst: true,
    columns: {
      date: g.date ?? "",
      description: g.description ?? "",
      amount: g.amount,
      debit: g.debit,
      credit: g.credit,
      currency: g.currency,
      valueDate: g.valueDate,
      reference: g.reference,
    },
  };
}

/**
 * Dry run — parses, redacts and maps WITHOUT persisting anything, so the household sees
 * exactly what will land: how many rows are usable, how many are duplicates of what is
 * already stored, and how many PII fields were stripped.
 */
export async function previewStatement(
  db: PrismaClient,
  householdId: string,
  documentId: string,
  overrideMapping?: MappingProfile | undefined,
): Promise<ImportPreview> {
  const { bytes, sniff } = await loadFile(db, documentId);

  if (sniff.format === "UNSUPPORTED_XLS" || sniff.format === "UNKNOWN") {
    return {
      format: sniff.format, encoding: sniff.encoding, unsupportedReason: sniff.reason,
      headers: [], headerRowIndex: 0, guessedMapping: {}, sampleRows: [], totalRows: 0,
      drafts: [], issues: [], duplicates: 0, redactedFields: 0, redactionVersion: REDACTION_VERSION,
    };
  }

  const { table, headerRowIndex } = buildTable(bytes, sniff.format, sniff.encoding);
  const members = await db.familyMember.findMany({ where: { householdId }, select: { name: true } });
  const memberNames = members.map((m) => m.name);
  const profile = overrideMapping ?? defaultProfile(table.headers);
  const { drafts, issues } = applyMapping(table, profile, memberNames);

  const refs = drafts.map((d) => d.externalRef).filter((r): r is string => Boolean(r));
  const duplicates = refs.length
    ? await db.transaction.count({ where: { householdId, externalRef: { in: refs } } })
    : 0;

  const dates = drafts.map((d) => d.bookedAt).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const detectedRange =
    first && last
      ? { start: first, end: last, days: Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1 }
      : undefined;

  return {
    format: sniff.format,
    encoding: sniff.encoding,
    unsupportedReason: sniff.reason,
    headers: table.headers,
    headerRowIndex,
    guessedMapping: guessMapping(table.headers) as unknown as Record<string, unknown>,
    sampleRows: table.records.slice(0, 5),
    totalRows: table.records.length,
    drafts: drafts.slice(0, 200),
    issues: issues.slice(0, 50),
    duplicates,
    redactedFields: drafts.reduce((n, d) => n + d.redactionHits.length, 0),
    redactionVersion: REDACTION_VERSION,
    detectedRange,
  };
}

/**
 * Commit. Records an ImportBatch for provenance, then inserts every non-duplicate draft.
 * Idempotent on `externalRef` — re-importing an overlapping date range (which WILL
 * happen, since bank exports are range-based) adds only what is new.
 */
export async function commitStatement(
  db: PrismaClient,
  householdId: string,
  documentId: string,
  adapterId: string,
  overrideMapping?: MappingProfile | undefined,
): Promise<{ batchId: string; inserted: number; duplicates: number }> {
  const { bytes, sniff } = await loadFile(db, documentId);
  if (sniff.format === "UNSUPPORTED_XLS" || sniff.format === "UNKNOWN") {
    throw new Error(`UNSUPPORTED_FORMAT:${sniff.reason ?? "UNKNOWN"}`);
  }

  const { table } = buildTable(bytes, sniff.format, sniff.encoding);
  const members = await db.familyMember.findMany({ where: { householdId }, select: { name: true } });
  const profile = overrideMapping ?? defaultProfile(table.headers);
  const { drafts } = applyMapping(table, profile, members.map((m) => m.name));

  const batch = await db.importBatch.create({
    data: {
      documentId,
      adapterId,
      adapterVersion: REDACTION_VERSION,
      status: "RUNNING",
      // Provenance without PII: the redacted drafts are the payload, never the raw file.
      rawPayload: JSON.parse(JSON.stringify({ kind: "STATEMENT_IMPORT", profile, rows: drafts.length })),
    },
  });

  const existingRefs = new Set(
    (
      await db.transaction.findMany({
        where: { householdId, externalRef: { in: refsOf(drafts) } },
        select: { externalRef: true },
      })
    ).map((r) => r.externalRef),
  );

  let inserted = 0;
  let duplicates = 0;
  for (const d of drafts) {
    if (d.externalRef && existingRefs.has(d.externalRef)) {
      duplicates += 1;
      continue;
    }
    await db.transaction.create({
      data: {
        householdId,
        importBatchId: batch.id,
        source: "IMPORT",
        status: d.status,
        bookedAt: new Date(d.bookedAt),
        valueDate: d.valueDate ? new Date(d.valueDate) : null,
        amount: d.amount,
        currency: d.currency,
        // Base-currency conversion belongs to the engine, which refuses without an
        // FxRate rather than guessing — so a non-ILS row lands with amountBase null.
        amountBase: d.currency === "ILS" ? d.amount : null,
        descriptionRedacted: d.descriptionRedacted,
        counterpartyMasked: d.counterpartyMasked ?? null,
        instalmentNumber: d.instalmentNumber ?? null,
        instalmentTotal: d.instalmentTotal ?? null,
        isRecurringCandidate: d.isRecurringCandidate,
        externalRef: d.externalRef ?? null,
      },
    });
    inserted += 1;
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: "COMPLETED", finishedAt: new Date() },
  });

  return { batchId: batch.id, inserted, duplicates };
}

function refsOf(drafts: TransactionDraft[]): string[] {
  return drafts.map((d) => d.externalRef).filter((r): r is string => Boolean(r));
}
