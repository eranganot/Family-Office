import { containsHebrew, repairHebrewWords } from "@wealthos/domain";
import { extractPdfCellLines, extractPdfLines } from "./pdf/extract";
import { parseBankTable } from "./pdf-bank-table";
import { toggleVisualHebrewLine } from "./normalize";
import { IL_STATEMENT_LEXICON } from "./tabular";
import { normaliseMinus, parseInstalments, looksRecurring } from "./statement-mapping";

/**
 * PDF statement line parser.
 *
 * The three Israeli card/bank PDFs in scope (FIBI, Isracard, Visa CAL) all render
 * Hebrew in VISUAL order, but — verified against the real files — the reversal is
 * TOKEN-order plus per-word character reversal, NOT a full-line character reversal.
 * Digits and Latin survive intact. `toggleVisualHebrewLine` is exactly that transform,
 * and it is an involution, so applying it to a visual-order line yields logical order.
 *
 * Rather than trusting a detector, each line is parsed in BOTH orientations and the one
 * that actually yields a date + amount wins. That is self-correcting: a PDF producer
 * that emits logical order already still parses, with no configuration.
 */

export interface PdfStatementRow {
  bookedAt: string; // ISO
  descriptionRaw: string;
  /** Signed: negative = outflow. Statements list charges unsigned, so the profile decides. */
  amount: string;
  currency: string;
  /** סכום עסקה when it differs from סכום חיוב (foreign currency / instalments). */
  originalAmount?: string | undefined;
  reference?: string | undefined;
  instalmentNumber?: number | undefined;
  instalmentTotal?: number | undefined;
  isRecurringCandidate: boolean;
  pending: boolean;
  page: number;
}

export interface PdfStatementResult {
  rows: PdfStatementRow[];
  /** Lines that looked like data but could not be parsed — surfaced, never hidden. */
  unparsed: string[];
  issuerGuess: PdfIssuer;
  totalLines: number;
}

export type PdfIssuer = "ISRACARD" | "CAL" | "FIBI_BANK" | "UNKNOWN";

/** dd/mm/yy, dd.mm.yy, dd/mm/yyyy — Israeli statements are always day-first. */
const DATE_RE = /\b(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})\b/;
/** ₪1,234.56 | -₪603.00 | $10.00 | 1,234.56 */
const AMOUNT_RE = /(-?)\s*([₪$€])?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;

const CURRENCY_BY_SYMBOL: Record<string, string> = { "₪": "ILS", $: "USD", "€": "EUR" };

function toIso(d: string, m: string, y: string): string | undefined {
  const yy = y.length === 2 ? `20${y}` : y;
  const mm = m.padStart(2, "0");
  const dd = d.padStart(2, "0");
  const probe = new Date(`${yy}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(probe.getTime())) return undefined;
  if (String(probe.getUTCDate()).padStart(2, "0") !== dd) return undefined; // rejects 31/02
  return `${yy}-${mm}-${dd}`;
}

interface Money {
  value: string;
  currency: string;
  negative: boolean;
}

function findAmounts(line: string): Money[] {
  const out: Money[] = [];
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(line)) !== null) {
    const raw = (m[3] ?? "").replace(/,/g, "");
    if (!raw || raw.length > 12) continue;
    // A bare integer with no decimals and no currency symbol is far more likely a
    // voucher/reference number than money; requiring a symbol OR decimals avoids
    // turning "629076429" into ₪629,076,429.
    const hasSymbol = Boolean(m[2]);
    const hasDecimals = raw.includes(".");
    if (!hasSymbol && !hasDecimals) continue;
    out.push({
      value: raw,
      currency: CURRENCY_BY_SYMBOL[m[2] ?? ""] ?? "ILS",
      negative: m[1] === "-",
    });
  }
  return out;
}

export interface PdfProfile {
  issuer: PdfIssuer;
  /**
   * Which amount on the line is the one that hits the account this period.
   * Isracard prints סכום עסקה then סכום חיוב; the CHARGE is the second.
   */
  amountPick: "FIRST" | "LAST";
  /** Statements list charges unsigned; card statements are outflows by default. */
  defaultSign: -1 | 1;
  /** Text that marks the rows below it as not-yet-settled. */
  pendingSectionMarkers: string[];
  defaultCurrency: string;
}

export const PDF_PROFILES: Record<Exclude<PdfIssuer, "UNKNOWN">, PdfProfile> = {
  ISRACARD: {
    issuer: "ISRACARD",
    amountPick: "LAST",
    defaultSign: -1,
    pendingSectionMarkers: [],
    defaultCurrency: "ILS",
  },
  CAL: {
    issuer: "CAL",
    amountPick: "FIRST",
    defaultSign: -1,
    // CAL groups rows under "עסקאות בתהליך קליטה" (in-process) — not yet settled.
    pendingSectionMarkers: ["בתהליך קליטה"],
    defaultCurrency: "ILS",
  },
  FIBI_BANK: {
    issuer: "FIBI_BANK",
    // Bank lines carry debit/credit/balance; the BALANCE is last, so the movement is first.
    amountPick: "FIRST",
    defaultSign: -1,
    pendingSectionMarkers: [],
    defaultCurrency: "ILS",
  },
};

export function guessIssuer(allText: string): PdfIssuer {
  const t = allText;
  if (/ISRACARD/i.test(t) || t.includes("ישראכרט") || t.includes("טרכארשי")) return "ISRACARD";
  if (t.includes("כאל") || t.includes("לאכ") || /\bCAL\b/i.test(t) || t.includes("ויזה") || t.includes("הזיו")) return "CAL";
  if (t.includes("הבינלאומי") || t.includes("ימואלניב") || t.includes("תנועות בחשבון") || t.includes("ןובשחב תועונת")) return "FIBI_BANK";
  return "UNKNOWN";
}

interface Parsed {
  iso: string;
  amounts: Money[];
  description: string;
}

/**
 * Strip the debris a statement line leaves behind once the date and amounts are removed:
 * voucher/terminal/reference numbers, stray date fragments, and orphaned punctuation.
 * Without this the merchant name arrives buried in digits, which both reads badly and
 * defeats merchant-key grouping.
 */
function cleanDescription(raw: string): string {
  let d = raw
    .replace(/[₪$€]/g, " ")
    // Any remaining dd/mm/yy(yy) or dd.mm.yy fragment.
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, " ")
    // ISO fragments that survive redaction/formatting.
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    // Reference / terminal / voucher numbers: 4+ digit runs carry no merchant signal.
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    // Leading/trailing orphaned punctuation left by the removals.
    .replace(/^[\s.,;:/\-|]+|[\s.,;:/\-|]+$/g, "")
    .trim();
  // Per-WORD Hebrew repair: a line can be mixed (one word reversed, the next correct),
  // which a single per-line orientation choice cannot fix.
  d = repairHebrewWords(d, IL_STATEMENT_LEXICON);
  return d;
}

/** Attempt to parse one orientation of a line. */
function parseOrientation(line: string): Parsed | undefined {
  const cleaned = normaliseMinus(line);
  const d = DATE_RE.exec(cleaned);
  if (!d) return undefined;
  const iso = toIso(d[1]!, d[2]!, d[3]!);
  if (!iso) return undefined;
  const amounts = findAmounts(cleaned.replace(d[0], " "));
  if (amounts.length === 0) return undefined;
  // Description = whatever is left once the date and every amount are removed.
  let description = cleaned.replace(d[0], " ");
  for (const a of amounts) {
    description = description.replace(new RegExp(`[₪$€]?\\s*${a.value.replace(".", "\\.")}`), " ");
  }
  description = cleanDescription(description);
  return { iso, amounts, description };
}

/**
 * Pick the better of the two orientations.
 *
 * Both usually parse (dates and numbers survive either way), so the tie-break is which
 * one produces readable Hebrew — measured by whether Hebrew final letters sit at word
 * ENDS (correct) rather than word starts (reversed). Same orthographic invariant the
 * merchant-key normaliser uses.
 */
function hebrewReadabilityScore(s: string): number {
  const FINALS = "ךםןףץ";
  let score = 0;
  for (const w of s.split(/\s+/)) {
    const chars = [...w].filter((c) => /[֐-׿]/.test(c));
    if (chars.length < 2) continue;
    if (FINALS.includes(chars[chars.length - 1]!)) score += 1;
    if (FINALS.includes(chars[0]!)) score -= 1;
  }
  return score;
}

/**
 * Pure over already-extracted lines, so the parsing logic is testable without
 * generating a PDF. `parsePdfStatement` is a thin wrapper that does the extraction.
 */
export function parseStatementLines(
  lines: ReadonlyArray<{ text: string; page: number }>,
  profileOverride?: PdfProfile | undefined,
): PdfStatementResult {
  const allText = lines.map((l) => l.text).join("\n");
  const issuerGuess = guessIssuer(allText);
  const profile =
    profileOverride ?? (issuerGuess === "UNKNOWN" ? PDF_PROFILES.ISRACARD : PDF_PROFILES[issuerGuess]);

  const rows: PdfStatementRow[] = [];
  const unparsed: string[] = [];
  let pending = false;

  for (const line of lines) {
    const raw = line.text;
    if (!raw || raw.length < 6) continue;

    // Section markers flip the pending flag for everything that follows.
    const toggled = toggleVisualHebrewLine(raw);
    for (const marker of profile.pendingSectionMarkers) {
      if (raw.includes(marker) || toggled.includes(marker)) pending = true;
    }

    const a = parseOrientation(raw);
    const b = containsHebrew(raw) ? parseOrientation(toggled) : undefined;

    let best: Parsed | undefined;
    if (a && b) best = hebrewReadabilityScore(b.description) >= hebrewReadabilityScore(a.description) ? b : a;
    else best = a ?? b;

    if (!best) {
      if (DATE_RE.test(raw)) unparsed.push(raw.slice(0, 160));
      continue;
    }

    const picked =
      profile.amountPick === "LAST" ? best.amounts[best.amounts.length - 1]! : best.amounts[0]!;
    const original =
      best.amounts.length > 1 && profile.amountPick === "LAST" ? best.amounts[0] : undefined;

    const magnitude = Number(picked.value);
    if (!Number.isFinite(magnitude) || magnitude === 0) continue;
    const sign = picked.negative ? -profile.defaultSign : profile.defaultSign;

    const instal = parseInstalments(best.description) ?? parseInstalments(toggled);

    rows.push({
      bookedAt: best.iso,
      descriptionRaw: best.description || "(ללא תיאור)",
      amount: String(sign * magnitude),
      currency: picked.currency || profile.defaultCurrency,
      originalAmount: original && original.value !== picked.value ? original.value : undefined,
      instalmentNumber: instal?.number,
      instalmentTotal: instal?.total,
      isRecurringCandidate: looksRecurring(toggled) || looksRecurring(raw),
      pending,
      page: line.page,
    });
  }

  return { rows, unparsed, issuerGuess, totalLines: lines.length };
}

export async function parsePdfStatement(
  bytes: Uint8Array,
  profileOverride?: PdfProfile | undefined,
): Promise<PdfStatementResult> {
  const lines = await extractPdfLines(bytes);
  const issuer = profileOverride?.issuer ?? guessIssuer(lines.map((l) => l.text).join("\n"));

  /**
   * BANK statements go through the COLUMN-AWARE parser, never the line heuristic.
   *
   * A bank row is `date | ref | balance | debit | credit | description`, and only the
   * column tells a running balance apart from a movement. The line heuristic used to
   * take "the first amount", which imported balances as expenses and threw away every
   * credit — so salary vanished and expenses were wildly overstated.
   *
   * If the columns cannot be identified, this REFUSES (returns no rows) rather than
   * falling back to the heuristic. Silently importing plausible-looking wrong numbers
   * into a financial ledger is far worse than importing nothing.
   */
  if (issuer === "FIBI_BANK") {
    const cellLines = await extractPdfCellLines(bytes);
    const table = parseBankTable(cellLines);
    if (!table.columnsFound) {
      return {
        rows: [],
        unparsed: ["BANK_COLUMNS_NOT_DETECTED"],
        issuerGuess: issuer,
        totalLines: cellLines.length,
      };
    }
    return {
      rows: table.rows.map((r) => ({
        bookedAt: r.bookedAt,
        descriptionRaw: r.descriptionRaw,
        amount: r.amount,
        currency: "ILS",
        reference: r.reference,
        isRecurringCandidate: false,
        pending: false,
        page: r.page,
      })),
      unparsed: table.unparsed,
      issuerGuess: issuer,
      totalLines: cellLines.length,
    };
  }

  return parseStatementLines(lines, profileOverride);
}
