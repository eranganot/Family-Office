import Papa from "papaparse";
import { cleanHebrew, looksVisualOrder, stripBidiControls } from "@wealthos/domain";
import { toggleVisualHebrewLine } from "./normalize";

/**
 * Generic tabular statement reader: CSV and HTML-table exports.
 *
 * Scope note (deliberate): legacy binary `.xls` (BIFF) is NOT handled. The only
 * npm-published library that reads BIFF is SheetJS's `xlsx`, whose npm distribution is
 * no longer maintained and carries known prototype-pollution and ReDoS advisories.
 * Pulling an unmaintained parser with open CVEs into a household financial system, to
 * read a format the bank will also export as CSV, is a bad trade. `.xls` files get a
 * precise "re-export as CSV" message instead — see `sniffFormat`.
 */

export type TabularFormat = "CSV" | "HTML" | "PDF" | "UNSUPPORTED_XLS" | "UNKNOWN";

export interface SniffResult {
  format: TabularFormat;
  encoding: "utf-8" | "windows-1255";
  /** Human-actionable reason, when the format cannot be read. */
  reason?: string | undefined;
}

const XLS_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // OLE2 compound document (BIFF .xls)
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // xlsx is a zip

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b);
}

/**
 * Israeli bank portals emit both UTF-8 and Windows-1255. Detection: valid UTF-8 that
 * contains Hebrew is UTF-8; otherwise, if high bytes fall in the CP1255 Hebrew range
 * (0xE0-0xFA), treat as Windows-1255.
 */
export function sniffEncoding(bytes: Uint8Array): "utf-8" | "windows-1255" {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Valid UTF-8. If it has Hebrew, it is definitely UTF-8.
    if (/[֐-׿]/.test(decoded)) return "utf-8";
  } catch {
    // Not valid UTF-8 -> almost certainly a legacy single-byte encoding.
    return "windows-1255";
  }
  const hebrewish = [...bytes.slice(0, 4096)].filter((b) => b >= 0xe0 && b <= 0xfa).length;
  return hebrewish > 8 ? "windows-1255" : "utf-8";
}

export function sniffFormat(bytes: Uint8Array, filename: string): SniffResult {
  const encoding = sniffEncoding(bytes);
  if (startsWith(bytes, XLS_MAGIC)) {
    return {
      format: "UNSUPPORTED_XLS",
      encoding,
      reason: "LEGACY_XLS",
    };
  }
  if (startsWith(bytes, ZIP_MAGIC)) {
    return { format: "UNSUPPORTED_XLS", encoding, reason: "XLSX_NOT_YET_SUPPORTED" };
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { format: "PDF", encoding }; // %PDF
  }
  const head = decodeBytes(bytes.slice(0, 4096), encoding).toLowerCase();
  if (head.includes("<table") || head.includes("<!doctype html") || head.includes("<html")) {
    return { format: "HTML", encoding };
  }
  if (/\.(csv|txt|tsv)$/i.test(filename) || head.includes(",") || head.includes("\t")) {
    return { format: "CSV", encoding };
  }
  return { format: "UNKNOWN", encoding, reason: "UNRECOGNISED_FORMAT" };
}

export function decodeBytes(bytes: Uint8Array, encoding: "utf-8" | "windows-1255"): string {
  return new TextDecoder(encoding).decode(bytes);
}

export interface TableGrid {
  /** Every row as raw cell strings, including any pre-header preamble rows. */
  rows: string[][];
}

/** Parse CSV/TSV. Delimiter is auto-detected by papaparse. */
export function parseCsvGrid(text: string): TableGrid {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: "greedy" });
  return { rows: (parsed.data as string[][]).map((r) => r.map((c) => (c ?? "").toString())) };
}

/**
 * Parse HTML `<table>` elements without a DOM dependency. Israeli portals emit plain
 * server-rendered tables (the Isracard-via-FIBI export is one), so a tolerant regex
 * reader is sufficient and avoids adding a parser to the dependency tree.
 *
 * Picks the LARGEST table on the page, which is reliably the transaction table rather
 * than the layout/header tables surrounding it.
 */
export function parseHtmlGrid(html: string): TableGrid {
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? [];
  let best: string[][] = [];
  for (const table of tables) {
    const rows: string[][] = [];
    for (const tr of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...(tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? [])].map((cell) =>
        decodeEntities(cell.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
      );
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > best.length) best = rows;
  }
  return { rows: best };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

/**
 * Find the header row: the first row whose cells are mostly non-numeric, non-empty and
 * distinct. Statements routinely carry title/account preamble rows above the real
 * header, so assuming row 0 would silently mis-parse the whole file.
 */
export function detectHeaderRow(rows: string[][], searchLimit = 15): number {
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, searchLimit); i += 1) {
    const cells = (rows[i] ?? []).map((c) => cleanHebrew(c));
    const filled = cells.filter((c) => c.length > 0);
    if (filled.length < 2) continue;
    const numeric = filled.filter((c) => /^[-+₪$€\d.,()\s]+$/.test(c)).length;
    const distinct = new Set(filled).size;
    // Reward: many filled, all distinct, few numeric.
    const score = filled.length + distinct - numeric * 3;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Vocabulary that actually appears in Israeli bank and card statements. Used ONLY as a
 * tie-breaker when the orthographic signal is neutral.
 *
 * Why it is needed: the lexicon-independent detector keys on Hebrew final letters
 * (ך ם ן ף ץ), which may appear only at the end of a word. That is decisive for most
 * text — but a word like "משכורת" contains no final letter at all, so reversing it is
 * orthographically undetectable. Statement vocabulary is small and fixed, so a lexicon
 * closes exactly that gap without weakening the general rule.
 */
export const IL_STATEMENT_LEXICON = [
  "תאריך", "תיאור", "חובה", "זכות", "יתרה", "אסמכתא", "סכום", "עסקה", "חיוב", "זיכוי",
  "משכורת", "העברה", "הפקדה", "משיכה", "שיק", "כרטיס", "אשראי", "ריבית", "עמלה", "מזומן",
  "תשלום", "תשלומים", "מתוך", "הוראת", "קבע", "מטבע", "ערך", "תנועה", "פעולה", "שובר",
  "בית", "עסק", "פירוט", "סניף", "חשבון", "בנק",
  // High-frequency MERCHANT words. Many Hebrew words (e.g. "מינימרקט") contain no
  // final letter, so their reversal is orthographically undetectable — the lexicon is
  // the only thing that can decide them. Kept to common, generic nouns rather than
  // specific vendors, which would be both endless and household-identifying.
  "מינימרקט", "מרקט", "סופר", "מכולת", "חנות", "מסעדה", "פיצה", "קפה", "דלק", "תחנת",
  "ביטוח", "עירייה", "עיריית", "חשמל", "מים", "ארנונה", "משכנתא", "רפואי", "מרקחת",
  "קצבת", "ילדים", "שוק", "מרכז", "חניון", "חניה", "נסיעות", "תחבורה", "רכב", "טיסה",
];

/**
 * Repair visual-order Hebrew in headers and cells (some HTML/XLS exports ship it).
 *
 * Uses `toggleVisualHebrewLine`, which reverses TOKEN order and the characters of
 * Hebrew tokens only — NOT a full character reversal. Full reversal fixes the Hebrew
 * but also reverses digits, turning "תשלום 12 מתוך 12" into instalment 21 of 21.
 * Mixed Hebrew+number cells are the norm in statements, so this distinction matters.
 */
export function normaliseGrid(grid: TableGrid): TableGrid {
  return {
    rows: grid.rows.map((r) =>
      r.map((c) => {
        const stripped = stripBidiControls(c);
        if (!/[֐-׿]/.test(stripped)) return stripped;
        const hit = IL_STATEMENT_LEXICON.some((w) => stripped.includes(w));
        if (hit) return stripped; // already logical order
        return looksVisualOrder(stripped) || IL_STATEMENT_LEXICON.some((w) => toggleVisualHebrewLine(stripped).includes(w))
          ? toggleVisualHebrewLine(stripped)
          : stripped;
      }),
    ),
  };
}

export interface ParsedTable {
  headers: string[];
  /** Data rows keyed by header. Duplicate headers get a numeric suffix. */
  records: Array<Record<string, string>>;
  headerRowIndex: number;
}

export function toRecords(grid: TableGrid, headerRowIndex: number): ParsedTable {
  const rawHeaders = (grid.rows[headerRowIndex] ?? []).map((h) => cleanHebrew(h));
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const base = h || `col${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  const records: Array<Record<string, string>> = [];
  for (let i = headerRowIndex + 1; i < grid.rows.length; i += 1) {
    const row = grid.rows[i] ?? [];
    if (row.every((c) => !c || c.trim() === "")) continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, j) => {
      rec[h] = (row[j] ?? "").trim();
    });
    records.push(rec);
  }
  return { headers, records, headerRowIndex };
}
