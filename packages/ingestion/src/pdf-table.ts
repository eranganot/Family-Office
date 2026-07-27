import { cleanHebrew } from "@wealthos/domain";
import type { CellLine } from "./pdf/extract";
import { parseIsraeliDate, parseLocalizedDecimal } from "./normalize";

/**
 * Card statements print two-digit years ("28.06.26"), which `parseIsraeliDate`
 * deliberately rejects — a bare 2-digit year is ambiguous in general. Inside a
 * statement it is not: these documents cover recent periods, so 20xx is the only
 * sensible reading. Kept local rather than loosening the shared parser, which other
 * adapters rely on being strict.
 */
function parseStatementDate(raw: string): string | undefined {
  const s = raw.trim();
  const four = parseIsraeliDate(s);
  if (four) return four;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/.exec(s);
  if (!m) return undefined;
  return parseIsraeliDate(`${m[1]}/${m[2]}/20${m[3]}`);
}
import { normaliseMinus, parseInstalments, looksRecurring } from "./statement-mapping";

/**
 * Column-aware parser for Israeli statement PDFs — bank AND card.
 *
 * ============================ THE TWO LESSONS ==============================
 * 1. pdfjs returns Hebrew in CORRECT LOGICAL ORDER. An earlier version applied
 *    character-level "RTL repair" and corrupted text that was already right. The
 *    reversal that motivated it came from pdfplumber (a Python analysis tool), NOT
 *    from pdfjs, which is what actually runs here. **No character reversal happens
 *    anywhere in this file.**
 * 2. Hebrew reads RIGHT-TO-LEFT, so text cells must be joined in DESCENDING x order.
 *    Joining ascending (the natural sort) turns «בעמ-מ» «העתקות» «גרמושקה» into
 *    "בעמ-מ העתקות גרמושקה" — every word correct, the ORDER reversed. That, not
 *    character direction, was the real defect.
 * ==========================================================================
 *
 * Numbers are identified by their COLUMN, never by position in a line: a bank row
 * carries balance, debit and credit, and only the column distinguishes them.
 */

export type TableKind = "BANK" | "CARD";

export interface PdfTableRow {
  bookedAt: string;
  descriptionRaw: string;
  /** Signed: negative = outflow. */
  amount: string;
  currency: string;
  /** סכום עסקה when it differs from the charge (foreign currency, instalments). */
  originalAmount?: string | undefined;
  originalCurrency?: string | undefined;
  balance?: string | undefined;
  reference?: string | undefined;
  instalmentNumber?: number | undefined;
  instalmentTotal?: number | undefined;
  isRecurringCandidate: boolean;
  pending: boolean;
  page: number;
}

export interface PdfTableResult {
  rows: PdfTableRow[];
  unparsed: string[];
  kind: TableKind | null;
  /** False when no header could be identified — the caller MUST NOT guess instead. */
  columnsFound: boolean;
  detectedColumns: string[];
}

type ColKey =
  | "date" | "valueDate" | "reference" | "sopf"
  | "balance" | "debit" | "credit"
  | "chargeAmount" | "txnAmount" | "extra"
  | "description";

interface HeaderSpec { key: ColKey; labels: string[] }

/** Bank: תאריך ערך | סו"פ | אסמכתא | יתרה | חובה | זכות | תיאור | תאריך */
const BANK_HEADERS: HeaderSpec[] = [
  { key: "valueDate", labels: ["תאריך ערך"] },
  { key: "sopf", labels: ['סו"פ', 'סופ"פ'] },
  { key: "reference", labels: ["אסמכתא"] },
  { key: "balance", labels: ["יתרה"] },
  { key: "debit", labels: ["חובה"] },
  { key: "credit", labels: ["זכות"] },
  { key: "description", labels: ["תיאור"] },
  { key: "date", labels: ["תאריך"] },
];

/** Card: פירוט נוסף | מס' שובר | סכום חיוב | סכום עסקה | שם בית עסק | תאריך רכישה */
const CARD_HEADERS: HeaderSpec[] = [
  { key: "extra", labels: ["פירוט נוסף", "פירוט"] },
  { key: "reference", labels: ["מס' שובר", "שובר"] },
  { key: "chargeAmount", labels: ["סכום חיוב"] },
  { key: "txnAmount", labels: ["סכום עסקה"] },
  { key: "description", labels: ["שם בית עסק", "בית עסק"] },
  { key: "date", labels: ["תאריך רכישה", "תאריך עסקה"] },
];

interface Column { key: ColKey; x: number }

/**
 * Header cells are often split across several text items ("שם" "בית" "עסק"), so the
 * row is reassembled in RTL order and each label located by where its words sit.
 */
function detectHeader(lines: CellLine[], specs: HeaderSpec[]): Column[] {
  let best: Column[] = [];
  for (const line of lines.slice(0, 40)) {
    const found: Column[] = [];
    // RTL: rightmost cell first.
    const rtl = [...line.cells].sort((a, b) => b.x - a.x);
    const joined = rtl.map((c) => cleanHebrew(c.text)).join(" ");
    for (const spec of specs) {
      if (found.some((f) => f.key === spec.key)) continue;
      for (const label of spec.labels) {
        if (!joined.includes(label)) continue;
        // Anchor on the label's LAST word: in RTL that is its leftmost cell, which is
        // where the column's values start.
        const words = label.split(/\s+/);
        const anchorWord = words[words.length - 1]!;
        const cell = rtl.find((c) => cleanHebrew(c.text) === anchorWord)
          ?? rtl.find((c) => cleanHebrew(c.text).includes(anchorWord));
        if (cell) {
          found.push({ key: spec.key, x: cell.x });
          break;
        }
      }
    }
    const hasMoney = found.some((f) =>
      f.key === "debit" || f.key === "credit" || f.key === "balance" || f.key === "chargeAmount");
    if (found.some((f) => f.key === "date") && hasMoney && found.length > best.length) {
      best = found;
    }
  }
  return best;
}

/**
 * In a table EVERY cell belongs to some column, so assignment is nearest-wins rather
 * than nearest-within-a-tight-window. A header label is often offset from the values
 * beneath it (the bank prints "תאריך" 34pt from its own dates), and a tight tolerance
 * silently drops those cells — which emptied the date bucket and yielded zero rows.
 * The cap only exists to discard far-flung page furniture.
 */
const ASSIGN_CAP = 150;

function nearest(columns: Column[], x: number, tolerance = ASSIGN_CAP): ColKey | undefined {
  let key: ColKey | undefined;
  let dist = Infinity;
  for (const c of columns) {
    const d = Math.abs(c.x - x);
    if (d < dist) { dist = d; key = c.key; }
  }
  return dist <= tolerance ? key : undefined;
}

/**
 * Join text cells in READING order.
 *
 * Hebrew reads right-to-left, so Hebrew cells join in DESCENDING x — that is the fix
 * for reversed word order. But NUMBERS are left-to-right even inside an RTL document,
 * and PDF producers split them across items ("₪130." + "85"), so numeric runs join in
 * ASCENDING x with NO separator, or the amount reassembles as "85 ₪130.".
 */
function joinRtl(cells: Array<{ x: number; text: string }>): string {
  if (cells.length === 0) return "";
  const hasHebrew = cells.some((c) => /[֐-׿]/.test(c.text));
  if (!hasHebrew) {
    return [...cells].sort((a, b) => a.x - b.x).map((c) => c.text).join("").trim();
  }
  return [...cells]
    .sort((a, b) => b.x - a.x)
    .map((c) => c.text)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function money(raw: string): { value: string; currency: string } | undefined {
  const t = normaliseMinus(raw);
  if (!t) return undefined;
  const currency = t.includes("$") ? "USD" : t.includes("€") ? "EUR" : "ILS";
  const v = parseLocalizedDecimal(t.replace(/[₪$€]/g, ""));
  return v ? { value: v, currency } : undefined;
}

const isNumericOnly = (s: string): boolean => /^[\d\s.,\-/]+$/.test(s) && /\d/.test(s);

export function parsePdfTable(lines: CellLine[]): PdfTableResult {
  const bankCols = detectHeader(lines, BANK_HEADERS);
  const cardCols = detectHeader(lines, CARD_HEADERS);
  const kind: TableKind | null =
    bankCols.length >= cardCols.length && bankCols.length > 0 ? "BANK"
    : cardCols.length > 0 ? "CARD"
    : null;
  let columns = kind === "BANK" ? bankCols : kind === "CARD" ? cardCols : [];
  let effectiveKind = kind;

  /**
   * Headerless card statements (Visa CAL prints from a browser, with no table header).
   * The layout is still a table — amount on the far left, merchant in the middle, date
   * on the far right — so columns are derived from the DATA when no header exists.
   * Only applied when a clear majority of lines fit that shape, so it cannot misfire
   * on an unrelated document.
   */
  if (!effectiveKind) {
    const shaped = lines.filter((l) => {
      if (l.cells.length < 3) return false;
      const right = l.cells[l.cells.length - 1]!;
      const left = l.cells[0]!;
      return Boolean(parseStatementDate(cleanHebrew(right.text))) && /[₪$€]/.test(left.text);
    });
    if (shaped.length >= 5) {
      const dateX = shaped.reduce((s2, l) => s2 + l.cells[l.cells.length - 1]!.x, 0) / shaped.length;
      const amtX = shaped.reduce((s2, l) => s2 + l.cells[0]!.x, 0) / shaped.length;
      // The merchant column is where the TEXT-BEARING middle cells are. Averaging all
      // middles pulls it toward the split-amount fragment ("₪130." + "85"), which drags
      // the derived column off the merchant and drops most rows.
      const middles = shaped
        .flatMap((l) => l.cells.slice(1, -1))
        .filter((c) => /\p{L}/u.test(c.text))
        .map((c) => c.x);
      const descX = middles.length > 0
        ? middles.reduce((a, b) => a + b, 0) / middles.length
        : (dateX + amtX) / 2;
      columns = [
        { key: "date", x: dateX },
        { key: "chargeAmount", x: amtX },
        { key: "description", x: descX },
      ];
      effectiveKind = "CARD";
    }
  }

  if (!effectiveKind || columns.length === 0) {
    return { rows: [], unparsed: [], kind: null, columnsFound: false, detectedColumns: [] };
  }
  const kindFinal = effectiveKind;

  const dateCol = columns.find((c) => c.key === "date");
  // The header row itself must never be mistaken for a description line.
  const headerIdx = lines.findIndex((l) => {
    const j = [...l.cells].sort((a, b) => b.x - a.x).map((c) => cleanHebrew(c.text)).join(" ");
    return (kindFinal === "BANK" ? ["תיאור", "יתרה"] : ["סכום חיוב", "שם בית עסק"]).every((lbl) => j.includes(lbl));
  });

  interface Classified { line: CellLine; isData: boolean; bucket: Partial<Record<ColKey, Array<{ x: number; text: string }>>>; date?: string | undefined }
  const classified: Classified[] = lines.map((line) => {
    const bucket: Partial<Record<ColKey, Array<{ x: number; text: string }>>> = {};
    for (const cell of line.cells) {
      const key = nearest(columns, cell.x);
      if (!key) continue;
      (bucket[key] ??= []).push(cell);
    }
    const rawDate = dateCol ? joinRtl([...(bucket.date ?? [])]) : "";
    const date = parseStatementDate(cleanHebrew(rawDate));
    return { line, isData: Boolean(date), bucket, date };
  });

  const rows: PdfTableRow[] = [];
  const unparsed: string[] = [];
  let pendingSection = false;

  classified.forEach((c, i) => {
    const wholeLine = joinRtl([...c.line.cells]);
    if (wholeLine.includes("בתהליך קליטה")) pendingSection = true;
    if (wholeLine.includes("לחיוב") && wholeLine.includes("עסקאות")) pendingSection = false;
    if (!c.isData) return;

    /**
     * Where the description lives differs by document, verified against the real files:
     *
     * BANK  — the operation name sits on its OWN line ABOVE the data row
     *         ("משיכת שיק"), and a NUMERIC line BELOW carries the cheque number or
     *         card last-4 ("1750400", "1401"). Both belong to this row.
     * CARD  — the merchant is INLINE in the description column. The lines BELOW
     *         ("הוראת קבע", "הנחה ₪0.60", "אתר חו"ל") are metadata about THIS row, and
     *         must not be glued onto the merchant name — but they are still needed as
     *         context for standing-order and instalment detection.
     */
    const parts: string[] = [];
    const extraContext: string[] = [];
    const inline = joinRtl([...(c.bucket.description ?? [])]);

    if (kindFinal === "BANK") {
      const before = classified[i - 1];
      if (before && !before.isData && i - 1 !== headerIdx) {
        const t = joinRtl([...before.line.cells]);
        if (t && !isNumericOnly(t)) parts.push(t);
      }
      if (inline) parts.push(inline);
      const after = classified[i + 1];
      if (after && !after.isData) {
        const t = joinRtl([...after.line.cells]);
        if (t && isNumericOnly(t)) parts.push(t);
      }
    } else {
      if (inline) parts.push(inline);
      // Metadata lines beneath a card row, until the next data row.
      for (let j = i + 1; j < classified.length; j += 1) {
        const nxt = classified[j];
        if (!nxt || nxt.isData) break;
        extraContext.push(joinRtl([...nxt.line.cells]));
      }
    }

    let amount: string | undefined;
    let currency = "ILS";
    let originalAmount: string | undefined;
    let originalCurrency: string | undefined;
    let balance: string | undefined;

    if (kindFinal === "BANK") {
      const debit = money(joinRtl([...(c.bucket.debit ?? [])]));
      const credit = money(joinRtl([...(c.bucket.credit ?? [])]));
      balance = money(joinRtl([...(c.bucket.balance ?? [])]))?.value;
      if (debit && Number(debit.value) !== 0) amount = String(-Math.abs(Number(debit.value)));
      else if (credit && Number(credit.value) !== 0) amount = String(Math.abs(Number(credit.value)));
    } else {
      const charge = money(joinRtl([...(c.bucket.chargeAmount ?? [])]));
      const txn = money(joinRtl([...(c.bucket.txnAmount ?? [])]));
      if (charge) {
        // A card charge is an OUTFLOW unless the statement prints an explicit minus
        // (a refund). Card statements list charges unsigned, so without this every
        // card expense would import as income.
        const negative = joinRtl([...(c.bucket.chargeAmount ?? [])]).includes("-");
        amount = String((negative ? 1 : -1) * Math.abs(Number(charge.value)));
        currency = "ILS"; // the charge column is always in the billing currency
        if (txn && (txn.currency !== "ILS" || txn.value !== charge.value)) {
          originalAmount = txn.value;
          originalCurrency = txn.currency;
        }
      }
    }

    if (!amount || Number(amount) === 0) {
      unparsed.push(`${c.date} ${parts.join(" ")}`.slice(0, 160));
      return;
    }

    const extra = joinRtl([...(c.bucket.extra ?? [])]);
    const context = `${parts.join(" ")} ${extra} ${extraContext.join(" ")}`;
    const inst = parseInstalments(context);

    rows.push({
      bookedAt: c.date!,
      descriptionRaw: parts.join(" ").trim() || "(ללא תיאור)",
      amount,
      currency,
      originalAmount,
      originalCurrency,
      balance,
      reference: joinRtl([...(c.bucket.reference ?? [])]) || undefined,
      instalmentNumber: inst?.number,
      instalmentTotal: inst?.total,
      isRecurringCandidate: looksRecurring(context),
      pending: pendingSection,
      page: c.line.page,
    });
  });

  return { rows, unparsed, kind: kindFinal, columnsFound: true, detectedColumns: columns.map((c) => c.key) };
}
