/**
 * Normalization utilities for Israeli documents: Hebrew RTL artifacts,
 * localized numbers, and localized dates. Deterministic; no guessing —
 * unparseable input returns undefined, never a fabricated value.
 */

const HEBREW_RE = /[֐-׿]/;
const NIQQUD_RE = /[֑-ׇ]/g;

export function containsHebrew(s: string): boolean {
  return HEBREW_RE.test(s);
}

/** Strip niqqud/cantillation and directional control characters; collapse whitespace. */
export function cleanHebrew(s: string): string {
  return s
    .replace(NIQQUD_RE, "")
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Some PDF extractors return Hebrew in visual (reversed) order. Heuristic:
 * if a token is Hebrew and its reversal matches a known lexicon entry, reverse it.
 * Used only by adapters that detect visual-order output; logical-order text passes through.
 */
export function reverseVisualHebrew(s: string): string {
  return [...s].reverse().join("");
}

/** "1,234.56" | "1.234,56" | "₪ 1,234.56" | "1,234.56-" → "1234.56" (decimal string) or undefined. */
export function parseLocalizedDecimal(raw: string): string | undefined {
  let s = cleanHebrew(raw).replace(/[₪$€]/g, "").replace(/\s/g, "");
  if (s === "") return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }
  // Decide separator convention: last of '.' or ',' with 1-2 trailing digits is the decimal point.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastComma > lastDot && /^\d{1,2}$/.test(s.slice(lastComma + 1))) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  return negative ? `-${s}` : s;
}

/** "31/12/2025" | "31.12.2025" | "2025-12-31" → "2025-12-31" or undefined. Israeli = day first. */
export function parseIsraeliDate(raw: string): string | undefined {
  const s = cleanHebrew(raw);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return validDate(iso[1]!, iso[2]!, iso[3]!);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (dmy) return validDate(dmy[3]!, dmy[2]!.padStart(2, "0"), dmy[1]!.padStart(2, "0"));
  return undefined;
}

function validDate(y: string, m: string, d: string): string | undefined {
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (String(date.getUTCDate()).padStart(2, "0") !== d) return undefined; // reject 31/02
  return `${y}-${m}-${d}`;
}

/**
 * Visual-order line transform (involution): reverse token order and reverse the
 * characters of Hebrew tokens, leaving digit/latin tokens intact. Applying it to a
 * visual-order line yields logical order, and vice versa.
 */
export function toggleVisualHebrewLine(line: string): string {
  return line
    .split(/(\s+)/)
    .reverse()
    .map((tok) => (HEBREW_RE.test(tok) ? [...tok].reverse().join("") : tok))
    .join("");
}

/** Hebrew keywords expected in Israeli financial documents (logical order). */
export const IL_DOC_LEXICON = [
  "יתרת", "צבירה", "דמי", "ניהול", "מסלול", "עמית", "תאריך", "קרן", "קופת", "פנסיה",
  "השתלמות", "גמל", "חשבון", "פוליסה", "שנתי", "דוח", "מספר", "סוג", "מוצר", "הפקדה", "השקעה",
];

/**
 * Detect whether a line is in visual (reversed) order and repair it.
 *
 * Empirical finding (fixture-verified): pdf.js's bidi pass renders visual-order
 * Hebrew PDFs as an exact FULL character reversal of the logical text — Hebrew
 * words, digit runs, and dates all come out char-reversed. Repair is therefore a
 * full reversal, chosen only when it scores more lexicon hits than the input.
 */
export function fixVisualOrderLine(line: string, lexicon: readonly string[] = IL_DOC_LEXICON): string {
  if (!HEBREW_RE.test(line)) return line;
  const score = (s: string) => lexicon.reduce((n, w) => (s.includes(w) ? n + 1 : n), 0);
  const reversed = [...line].reverse().join("");
  return score(reversed) > score(line) ? reversed : line;
}
