import type { PrismaClient } from "@wealthos/db";
import { fileStore } from "@wealthos/db";
import {
  applyMapping, decodeBytes, detectHeaderRow, guessMapping, normaliseGrid, parseCsvGrid,
  parseHtmlGrid, extractPdfCellLines, parsePdfTable, pdfRowsToDrafts, detectCardLast4, looksLikeCardStatement, REDACTION_VERSION, sniffFormat, toRecords,
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
  /** Reconciliation against the statement's OWN printed total (PDF only). */
  statementTotal?: number | undefined;
  parsedTotal?: number | undefined;
  reconciles?: boolean | undefined;
  /** Direction summary, so a sign error is visible BEFORE anything is imported. */
  inflowCount: number;
  outflowCount: number;
  inflowTotal: number;
  outflowTotal: number;
}

async function loadFile(db: PrismaClient, documentId: string) {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("DOCUMENT_NOT_FOUND");
  const bytes = await fileStore().get(doc.storageKey);
  return { doc, bytes, sniff: sniffFormat(bytes, doc.filename) };
}

/**
 * The owner declares the statement type at upload. There are exactly two
 * (owner, 2026-07-28): CARD — charges only, income solely as a minus-signed refund;
 * BANK — both directions. Declared beats inferred: sign conventions differ, and a
 * wrong guess flips every row on the statement.
 */
function declaredKind(docType: string | null): "BANK" | "CARD" | undefined {
  if (docType === "CARD_STATEMENT") return "CARD";
  if (docType === "BANK_STATEMENT") return "BANK";
  return undefined;
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
  const { doc, bytes, sniff } = await loadFile(db, documentId);

  if (sniff.format === "UNSUPPORTED_XLS" || sniff.format === "UNKNOWN") {
    return {
      format: sniff.format, encoding: sniff.encoding, unsupportedReason: sniff.reason,
      headers: [], headerRowIndex: 0, guessedMapping: {}, sampleRows: [], totalRows: 0,
      drafts: [], issues: [], duplicates: 0, redactedFields: 0, redactionVersion: REDACTION_VERSION,
      inflowCount: 0, outflowCount: 0, inflowTotal: 0, outflowTotal: 0,
    };
  }

  const members = await db.familyMember.findMany({ where: { householdId }, select: { name: true } });
  const memberNames = members.map((m) => m.name);

  let drafts: TransactionDraft[];
  let issues: Array<{ rowIndex: number; reason: string; raw: string }>;
  let headers: string[] = [];
  let headerRowIndex = 0;
  let sampleRows: Array<Record<string, string>> = [];
  let totalRows = 0;
  let guessed: Record<string, unknown> = {};
  let statementTotal: number | undefined;
  let parsedTotal: number | undefined;
  let reconciles: boolean | undefined;

  if (sniff.format === "PDF") {
    // PDFs have no columns to map — the layout IS the format, so there is no mapping
    // wizard for them. Rows go through pdfRowsToDrafts, which calls the same redact().
    const parsed = parsePdfTable(await extractPdfCellLines(bytes), declaredKind(doc.docType));
    drafts = pdfRowsToDrafts(parsed.rows, memberNames);
    issues = parsed.columnsFound
      ? parsed.unparsed.map((raw: string, i: number) => ({ rowIndex: i, reason: "UNPARSED_LINE", raw }))
      : [{ rowIndex: 0, reason: "UNPARSED_LINE", raw: "BANK_COLUMNS_NOT_DETECTED" }];
    totalRows = parsed.rows.length + parsed.unparsed.length;
    guessed = { issuer: parsed.kind ?? "UNKNOWN", columns: parsed.detectedColumns.join(",") };
    statementTotal = parsed.statementTotal;
    parsedTotal = parsed.parsedTotal;
    reconciles = parsed.reconciles;
  } else {
    const built = buildTable(bytes, sniff.format, sniff.encoding);
    headerRowIndex = built.headerRowIndex;
    headers = built.table.headers;
    sampleRows = built.table.records.slice(0, 5);
    totalRows = built.table.records.length;
    const base = overrideMapping ?? defaultProfile(built.table.headers);
    // Declared type OR header shape - either is enough to force outflow. A card file
    // mis-declared as a bank statement would otherwise import every expense as income.
    const isCard = declaredKind(doc.docType) === "CARD" || looksLikeCardStatement(built.table.headers);
    const profile: MappingProfile = isCard ? { ...base, allOutflow: true } : base;
    const mapped = applyMapping(built.table, profile, memberNames);
    drafts = mapped.drafts;
    issues = mapped.issues;
    guessed = guessMapping(built.table.headers) as unknown as Record<string, unknown>;
  }

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
    headers,
    headerRowIndex,
    guessedMapping: guessed,
    sampleRows,
    totalRows,
    drafts: drafts.slice(0, 200),
    issues: issues.slice(0, 50),
    duplicates,
    redactedFields: drafts.reduce((n, d) => n + d.redactionHits.length, 0),
    redactionVersion: REDACTION_VERSION,
    detectedRange,
    statementTotal,
    parsedTotal,
    reconciles,
    inflowCount: drafts.filter((d) => Number(d.amount) > 0).length,
    outflowCount: drafts.filter((d) => Number(d.amount) < 0).length,
    inflowTotal: Math.round(drafts.filter((d) => Number(d.amount) > 0).reduce((n, d) => n + Number(d.amount), 0) * 100) / 100,
    outflowTotal: Math.round(drafts.filter((d) => Number(d.amount) < 0).reduce((n, d) => n + Number(d.amount), 0) * 100) / 100,
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
  const { doc, bytes, sniff } = await loadFile(db, documentId);
  if (sniff.format === "UNSUPPORTED_XLS" || sniff.format === "UNKNOWN") {
    throw new Error(`UNSUPPORTED_FORMAT:${sniff.reason ?? "UNKNOWN"}`);
  }

  const members = await db.familyMember.findMany({ where: { householdId }, select: { name: true } });
  const memberNames = members.map((m) => m.name);

  let drafts: TransactionDraft[];
  let profile: MappingProfile | { issuer: string };
  if (sniff.format === "PDF") {
    const parsed = parsePdfTable(await extractPdfCellLines(bytes), declaredKind(doc.docType));
    if (!parsed.columnsFound) throw new Error("BANK_COLUMNS_NOT_DETECTED");
    drafts = pdfRowsToDrafts(parsed.rows, memberNames);
    profile = { issuer: parsed.kind ?? "UNKNOWN" };
  } else {
    const { table } = buildTable(bytes, sniff.format, sniff.encoding);
    const base = overrideMapping ?? defaultProfile(table.headers);
    // A CARD statement lists every charge as a POSITIVE number. Without this, each
    // card expense imports as income - the owner's "numbers are opposite" report.
    const isCard = declaredKind(doc.docType) === "CARD" || looksLikeCardStatement(table.headers);
    const p: MappingProfile = isCard ? { ...base, allOutflow: true } : base;
    drafts = applyMapping(table, p, memberNames).drafts;
    profile = p;
  }

  const batch = await db.importBatch.create({
    data: {
      documentId,
      adapterId,
      adapterVersion: REDACTION_VERSION,
      status: "RUNNING",
      // Provenance without PII: the redacted drafts are the payload, never the raw file.
      rawPayload: JSON.parse(
        JSON.stringify({
          kind: "STATEMENT_IMPORT",
          statementType: doc.docType ?? null,
          // Recorded so a bank aggregate card-bill line can later be matched to the
          // detail and excluded, instead of double-counting the same money.
          cardLast4:
            declaredKind(doc.docType) === "CARD"
              ? (detectCardLast4(drafts.map((d) => d.descriptionRedacted).join(" "), doc.filename) ?? null)
              : null,
          profile,
          rows: drafts.length,
        }),
      ),
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
        // Without this, imported rows cannot participate in owner memory or
        // "apply to this merchant" - the learning loop silently excludes them.
        merchantKey: d.merchantKey || null,
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
