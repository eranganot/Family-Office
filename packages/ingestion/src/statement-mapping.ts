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
  /**
   * A column stating the DIRECTION in words ("חיוב" / "זכות" / debit / credit) rather
   * than holding an amount. OneZero exports one signed amount plus this indicator; an
   * earlier guesser matched it as BOTH the debit and the credit column and then found
   * no numbers in either, yielding zero usable rows.
   */
  direction?: string | undefined;
  /** Cell text that marks a row as not-yet-settled (e.g. "בתהליך קליטה"). */
  pendingMarker?: string | undefined;
}

export type AmountMode = "SIGNED" | "DEBIT_CREDIT";

export interface MappingProfile {
  amountMode: AmountMode;
  /**
   * Card statements list every charge as a POSITIVE number — there is no sign, because
   * the whole document is charges. Without this flag every card expense imports as
   * income. Only an explicit minus (a refund) flips it back.
   */
  allOutflow?: boolean | undefined;
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

export type DateOrder = "DMY" | "MDY";

/**
 * Detect whether a date column is day-first or month-first.
 *
 * Israeli statements are day-first, but some exports (the owner's OneZero CSV) emit
 * US month-first dates like "07/15/2026". Parsing those day-first makes month 15,
 * every row fails validation, and the import silently yields ZERO usable rows — which
 * looks like "the tool cannot read the file" rather than a date-format mismatch.
 *
 * A component > 12 can only be a day, so one unambiguous sample settles the whole
 * column. With no evidence either way it stays DMY, the Israeli norm.
 */
export function detectDateOrder(samples: readonly string[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const raw of samples) {
    const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(raw.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmy += 1;
    else if (b > 12 && a <= 12) mdy += 1;
  }
  return mdy > dmy ? "MDY" : "DMY";
}

/** Parse a date with an explicit component order. */
export function parseDateWithOrder(raw: string, order: DateOrder): string | undefined {
  const t = cleanHebrew(raw);
  if (order === "DMY") return parseIsraeliDate(t);
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(t);
  if (!m) return parseIsraeliDate(t); // ISO and other shapes fall through
  const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return parseIsraeliDate(`${m[2]}/${m[1]}/${year}`);
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

  // Decide the date order ONCE from the whole column, not per row: a single
  // unambiguous sample (a day > 12) settles every other row in the file.
  const order = detectDateOrder(table.records.map((r) => cleanHebrew(cell(r, c.date))));

  table.records.forEach((rec, i) => {
    const rawDate = cell(rec, c.date);
    const bookedAt = parseDateWithOrder(rawDate, order);
    if (!bookedAt) {
      issues.push({ rowIndex: i, reason: "NO_DATE", raw: rawDate });
      return;
    }

    let signed: string | undefined;
    if (profile.amountMode === "SIGNED") {
      const parsed = parseLocalizedDecimal(cell(rec, c.amount));
      const directionText = cleanHebrew(cell(rec, c.direction)).toLowerCase();
      if (parsed !== undefined && directionText) {
        // The statement states the direction explicitly — trust it over the sign, which
        // some exports omit entirely.
        const magnitude = Math.abs(Number(parsed));
        if (CREDIT_WORDS.some((w) => directionText.includes(w))) signed = String(magnitude);
        else if (DEBIT_WORDS.some((w) => directionText.includes(w))) signed = String(-magnitude);
        else signed = parsed;
      } else if (parsed !== undefined && profile.allOutflow) {
        // Preserve an explicit minus (refund); otherwise force outflow.
        signed = Number(parsed) < 0 ? String(Math.abs(Number(parsed))) : String(-Math.abs(Number(parsed)));
      } else {
        signed = parsed;
      }
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

    // The reference is kept for `externalRef` only. Appending it to the description
    // added noise AND made the redactor mistake it for a bank account number
    // ("25-21416640" -> [ACCT]), which corrupted the visible merchant text.
    const descriptionRaw = cell(rec, c.description).trim();

    // REDACTION HAPPENS HERE - before the value is ever returned to a caller, and
    // therefore before it can reach the database. There is no path that persists raw text.
    const red = redact(descriptionRaw, memberNames);

    const wholeRow = Object.values(rec).join(" ");
    const inst = parseInstalments(wholeRow);
    const pending = Boolean(c.pendingMarker && wholeRow.includes(c.pendingMarker));

    drafts.push({
      bookedAt,
      valueDate: parseDateWithOrder(cell(rec, c.valueDate), order),
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

  // Genuinely identical rows (same day, amount and description) are distinct
  // transactions, so give them distinct keys rather than letting one overwrite the other.
  const withIdx = withOccurrences(drafts.map((d) => d.externalRef ?? ""));
  drafts.forEach((d, i) => {
    d.externalRef = withIdx[i] ?? d.externalRef;
  });

  return { drafts, issues };
}

/**
 * Idempotency key for re-import.
 *
 * CRITICAL HISTORY — do NOT key on the statement's reference alone. The FIBI bank
 * statement's אסמכתא is an OPERATION-TYPE code, not a transaction id: "13795" appears
 * on 41 different rows. Keying on it collapsed 111 real transactions to 38 unique keys
 * and the unique constraint silently discarded the other 73 — including a July salary
 * that collided with January's. Nothing errored; the money simply never arrived.
 *
 * The key is therefore a digest of date + amount + description + reference. That is
 * stable across re-imports of the same file (so overlapping ranges still deduplicate)
 * while being distinct per transaction.
 *
 * `occurrence` disambiguates genuinely identical rows — two identical coffees on the
 * same day are two real transactions, not a duplicate — and is assigned by position
 * within the file, so the same file always yields the same keys.
 */
export function buildExternalRef(
  bookedAt: string,
  amount: string,
  description: string,
  reference: string,
  occurrence = 1,
): string {
  const basis = `${bookedAt}|${amount}|${description}|${reference}`;
  let h = 5381;
  for (let i = 0; i < basis.length; i += 1) h = ((h * 33) ^ basis.charCodeAt(i)) >>> 0;
  const suffix = occurrence > 1 ? `#${occurrence}` : "";
  return `txn:${bookedAt}:${h.toString(36)}${suffix}`;
}

/** Assign per-file occurrence numbers so identical rows get distinct keys. */
export function withOccurrences(keys: string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((k) => {
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > 1 ? `${k}#${n}` : k;
  });
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
  direction: ["חיוב/זיכוי", "חובה/זכות", "סוג תנועה", "debit/credit", "type"],
  pendingMarker: [],
};

const CREDIT_WORDS = ["זיכוי", "זכות", "credit", "deposit"];
const DEBIT_WORDS = ["חיוב", "חובה", "debit", "withdrawal"];

/**
 * Recognise a CARD statement from its headers alone.
 *
 * A card statement has a charge column ("סכום חיוב") and a merchant column, and
 * crucially NO זכות/חובה pair — every row is a charge. A bank statement always has the
 * debit/credit pair. This is a SAFETY NET on top of the owner's declared type: a card
 * file mis-declared as a bank statement would otherwise import every expense as income,
 * which is exactly the failure the owner hit.
 */
export function looksLikeCardStatement(headers: string[]): boolean {
  const h = headers.map((x) => cleanHebrew(x));
  const hasDebitCredit =
    h.some((x) => x.includes("חובה") || x.includes("debit")) &&
    h.some((x) => x.includes("זכות") || x.includes("credit"));
  if (hasDebitCredit) return false;
  const hasCharge = h.some((x) => x.includes("סכום חיוב") || x.includes("סכום עסקה"));
  const hasMerchant = h.some((x) => x.includes("בית עסק") || x.includes("שם העסק") || x.includes("בית  עסק"));
  return hasCharge || hasMerchant;
}

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
  let debit = find(HEADER_SYNONYMS.debit);
  let credit = find(HEADER_SYNONYMS.credit);
  // One header matching BOTH is a direction indicator, not two money columns.
  const direction = find(HEADER_SYNONYMS.direction) ?? (debit && debit === credit ? debit : undefined);
  if (direction && debit === credit) {
    debit = undefined;
    credit = undefined;
  }
  const amountMode: AmountMode = debit && credit ? "DEBIT_CREDIT" : "SIGNED";
  return {
    amountMode,
    direction,
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
  const built: TransactionDraft[] = rows.map((r) => {
    const red = redact(r.descriptionRaw, memberNames);
    return {
      bookedAt: r.bookedAt,
      amount: r.amount,
      currency: r.currency,
      descriptionRedacted: red.text || "(ללא תיאור)",
      merchantKey: normalizeMerchantKey(red.text),
      externalRef: buildExternalRef(r.bookedAt, r.amount, red.text, r.reference ?? ""),
      status: (r.pending ? "PENDING" : "BOOKED") as TransactionDraft["status"],
      counterpartyMasked: red.counterpartyMasked,
      instalmentNumber: r.instalmentNumber,
      instalmentTotal: r.instalmentTotal,
      isRecurringCandidate: r.isRecurringCandidate,
      redactionHits: red.hits,
    };
  });
  const withIdx = withOccurrences(built.map((d) => d.externalRef ?? ""));
  built.forEach((d, i) => {
    d.externalRef = withIdx[i] ?? d.externalRef;
  });
  return built;
}
