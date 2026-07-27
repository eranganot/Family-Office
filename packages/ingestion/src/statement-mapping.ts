import { cleanHebrew, normalizeMerchantKey } from "@wealthos/domain";
import { parseIsraeliDate, parseLocalizedDecimal } from "./normalize";
import { redact, type RedactionHit } from "./redact";
import type { ParsedTable } from "./tabular";

/**
 * Column-mapping profile: how one institution's export maps onto a transaction.
 * Saved per source (`ImportMappingProfile`) so the mapping is chosen once, not
 * per import — which is what makes "any bank" work without a bespoke adapter.
 */
export interface ColumnMapping {
  date: string;
  description: string;
  /** SIGNED: one amount column carrying the sign. */
  amount?: string | undefined;
  /** DEBIT_CREDIT: separate outflow / inflow columns (FIBI, OneZero). */
  debit?: string | undefined;
  credit?: string | undefined;
  currency?: string | undefined;
  valueDate?: string | undefined;
  reference?: string | undefined;
  balance?: string | undefined;
  /** Cell text that marks a row as not-yet-settled (e.g. "בתהליך קליטה"). */
  pendingMarker?: string | undefined;
}

export type AmountMode = "SIGNED" | "DEBIT_CREDIT";

export interface MappingProfile {
  amountMode: AmountMode;
  columns: ColumnMapping;
  defaultCurrency: string;
  /** Israeli statements are day-first; kept explicit so US exports can differ. */
  dayFirst: boolean;
}

export interface TransactionDraft {
  bookedAt: string; // ISO yyyy-mm-dd
  valueDate?: string | undefined;
  /** Signed decimal string; negative = outflow. */
  amount: string;
  currency: string;
  descriptionRedacted: string;
  /**
   * Derived from the REDACTED description, so it is stable, contains no PII, and
   * matches what the classifier and owner-memory lookups use. Stamped here rather
   * than left null: without it, imported rows cannot participate in "apply to this
   * merchant", which is the entire learning loop.
   */
  merchantKey: string;
  externalRef?: string | undefined;
  status: "BOOKED" | "PENDING";
  counterpartyMasked?: string | undefined;
  instalmentNumber?: number | undefined;
  instalmentTotal?: number | undefined;
  isRecurringCandidate: boolean;
  redactionHits: RedactionHit[];
}

export interface MappingIssue {
  rowIndex: number;
  reason: "NO_DATE" | "NO_AMOUNT" | "ZERO_AMOUNT";
  raw: string;
}

export interface MappedResult {
  drafts: TransactionDraft[];
  issues: MappingIssue[];
}

/** "תשלום 3 מתוך 12" / "payment 3 of 12" → { number: 3, total: 12 }. */
export function parseInstalments(text: string): { number: number; total: number } | undefined {
  const he = /תשלום\s*(\d{1,3})\s*מתוך\s*(\d{1,3})/.exec(text);
  if (he) return { number: Number(he[1]), total: Number(he[2]) };
  const en = /(?:payment|instal?ment)\s*(\d{1,3})\s*(?:of|\/)\s*(\d{1,3})/i.exec(text);
  if (en) return { number: Number(en[1]), total: Number(en[2]) };
  const bare = /\b(\d{1,3})\s*\/\s*(\d{1,3})\s*תשלומים/.exec(text);
  if (bare) return { number: Number(bare[1]), total: Number(bare[2]) };
  return undefined;
}

const RECURRING_MARKERS = ["הוראת קבע", "הו\"ק", "הוק", "standing order", "direct debit"];

export function looksRecurring(text: string): boolean {
  const t = cleanHebrew(text).toLowerCase();
  return RECURRING_MARKERS.some((m) => t.includes(m.toLowerCase()));
}

/**
 * U+2212 MINUS SIGN (and the Unicode dashes) appear instead of ASCII '-' in real
 * Israeli card statements. Normalising them is the difference between a refund
 * parsing as a credit and being silently dropped.
 */
export function normaliseMinus(s: string): string {
  return s.replace(/[−‒–—―]/g, "-");
}

function cell(rec: Record<string, string>, key: string | undefined): string {
  if (!key) return "";
  return normaliseMinus(rec[key] ?? "");
}

/**
 * Apply a mapping profile to a parsed table.
 *
 * A row that cannot yield a date AND a non-zero amount is NOT silently skipped — it is
 * reported as an issue so the preview can show it. Statements carry subtotal, header
 * and footer rows that legitimately fail this, and the user should see how many were
 * dropped rather than wonder why the total is short.
 */
export function applyMapping(
  table: ParsedTable,
  profile: MappingProfile,
  memberNames: readonly string[] = [],
): MappedResult {
  const drafts: TransactionDraft[] = [];
  const issues: MappingIssue[] = [];
  const c = profile.columns;

  table.records.forEach((rec, i) => {
    const rawDate = cell(rec, c.date);
    const bookedAt = parseIsraeliDate(rawDate);
    if (!bookedAt) {
      issues.push({ rowIndex: i, reason: "NO_DATE", raw: rawDate });
      return;
    }

    let signed: string | undefined;
    if (profile.amountMode === "SIGNED") {
      signed = parseLocalizedDecimal(cell(rec, c.amount));
    } else {
      const debit = parseLocalizedDecimal(cell(rec, c.debit));
      const credit = parseLocalizedDecimal(cell(rec, c.credit));
      // Debit = outflow (negative), credit = inflow (positive). Exactly one is present
      // on a well-formed row; if both are, debit wins and the row is still reported.
      if (debit && Number(debit) !== 0) signed = `-${Math.abs(Number(debit))}`;
      else if (credit && Number(credit) !== 0) signed = String(Math.abs(Number(credit)));
    }

    if (signed === undefined) {
      issues.push({ rowIndex: i, reason: "NO_AMOUNT", raw: JSON.stringify(rec).slice(0, 120) });
      return;
    }
    if (Number(signed) === 0) {
      issues.push({ rowIndex: i, reason: "ZERO_AMOUNT", raw: rawDate });
      return;
    }

    const descriptionRaw = [cell(rec, c.description), cell(rec, c.reference)]
      .filter(Boolean)
      .join(" ")
      .trim();

    // REDACTION HAPPENS HERE - before the value is ever returned to a caller, and
    // therefore before it can reach the database. There is no path that persists raw text.
    const red = redact(descriptionRaw, memberNames);

    const wholeRow = Object.values(rec).join(" ");
    const inst = parseInstalments(wholeRow);
    const pending = Boolean(c.pendingMarker && wholeRow.includes(c.pendingMarker));

    drafts.push({
      bookedAt,
      valueDate: parseIsraeliDate(cell(rec, c.valueDate)),
      amount: signed,
      currency: (cell(rec, c.currency) || profile.defaultCurrency).toUpperCase().slice(0, 3),
      descriptionRedacted: red.text || "(ללא תיאור)",
      merchantKey: normalizeMerchantKey(red.text),
      externalRef: buildExternalRef(bookedAt, signed, red.text, cell(rec, c.reference)),
      status: pending ? "PENDING" : "BOOKED",
      counterpartyMasked: red.counterpartyMasked,
      instalmentNumber: inst?.number,
      instalmentTotal: inst?.total,
      isRecurringCandidate: looksRecurring(wholeRow),
      redactionHits: red.hits,
    });
  });

  return { drafts, issues };
}

/**
 * Idempotency key. Prefers the statement's own reference; otherwise a stable digest of
 * (date, amount, description) so re-importing an overlapping date range does not
 * duplicate rows — which WILL happen, because bank exports are range-based.
 */
export function buildExternalRef(
  bookedAt: string,
  amount: string,
  description: string,
  reference: string,
): string {
  if (reference && reference.trim().length >= 4) return `ref:${reference.trim()}`;
  const basis = `${bookedAt}|${amount}|${description}`;
  let h = 5381;
  for (let i = 0; i < basis.length; i += 1) h = ((h * 33) ^ basis.charCodeAt(i)) >>> 0;
  return `syn:${bookedAt}:${h.toString(36)}`;
}

/** Header synonyms so the wizard can pre-fill the mapping instead of asking blind. */
export const HEADER_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  date: ["תאריך", "תאריך עסקה", "תאריך תנועה", "תאריך רכישה", "תאריך חיוב", "date", "transaction date", "posting date"],
  valueDate: ["תאריך ערך", "value date"],
  description: ["תיאור", "שם בית עסק", "שם העסק", "פירוט", "description", "merchant", "details", "narrative"],
  amount: ["סכום", "סכום חיוב", "סכום עסקה", "סכום פעולה", "amount", "sum"],
  debit: ["חובה", "חיוב", "debit", "withdrawal"],
  credit: ["זכות", "זיכוי", "credit", "deposit"],
  currency: ["מטבע", "currency"],
  reference: ["אסמכתא", "מס' שובר", "מספר שובר", "reference", "ref"],
  balance: ["יתרה", "balance"],
  pendingMarker: [],
};

/** Best-effort mapping guess from the headers, for the wizard's initial state. */
export type MappingGuess = { [K in keyof ColumnMapping]?: string | undefined } & { amountMode: AmountMode };

export function guessMapping(headers: string[]): MappingGuess {
  const norm = headers.map((h) => cleanHebrew(h).toLowerCase());
  const find = (syns: string[]): string | undefined => {
    for (const syn of syns) {
      const i = norm.findIndex((h) => h === syn.toLowerCase());
      if (i >= 0) return headers[i];
    }
    for (const syn of syns) {
      const i = norm.findIndex((h) => h.includes(syn.toLowerCase()));
      if (i >= 0) return headers[i];
    }
    return undefined;
  };
  const debit = find(HEADER_SYNONYMS.debit);
  const credit = find(HEADER_SYNONYMS.credit);
  const amountMode: AmountMode = debit && credit ? "DEBIT_CREDIT" : "SIGNED";
  return {
    amountMode,
    date: find(HEADER_SYNONYMS.date),
    valueDate: find(HEADER_SYNONYMS.valueDate),
    description: find(HEADER_SYNONYMS.description),
    amount: find(HEADER_SYNONYMS.amount),
    debit,
    credit,
    currency: find(HEADER_SYNONYMS.currency),
    reference: find(HEADER_SYNONYMS.reference),
    balance: find(HEADER_SYNONYMS.balance),
  };
}

/**
 * Convert parsed PDF statement rows into the same `TransactionDraft` shape the tabular
 * path produces — crucially through the SAME `redact()` call, so PDFs cannot become a
 * back door that writes un-redacted text to the database.
 */
export function pdfRowsToDrafts(
  rows: ReadonlyArray<{
    bookedAt: string;
    descriptionRaw: string;
    amount: string;
    currency: string;
    originalAmount?: string | undefined;
    reference?: string | undefined;
    instalmentNumber?: number | undefined;
    instalmentTotal?: number | undefined;
    isRecurringCandidate: boolean;
    pending: boolean;
  }>,
  memberNames: readonly string[] = [],
): TransactionDraft[] {
  return rows.map((r) => {
    const red = redact(r.descriptionRaw, memberNames);
    return {
      bookedAt: r.bookedAt,
      amount: r.amount,
      currency: r.currency,
      descriptionRedacted: red.text || "(ללא תיאור)",
      merchantKey: normalizeMerchantKey(red.text),
      externalRef: buildExternalRef(r.bookedAt, r.amount, red.text, r.reference ?? ""),
      status: r.pending ? "PENDING" : "BOOKED",
      counterpartyMasked: red.counterpartyMasked,
      instalmentNumber: r.instalmentNumber,
      instalmentTotal: r.instalmentTotal,
      isRecurringCandidate: r.isRecurringCandidate,
      redactionHits: red.hits,
    };
  });
}
