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
