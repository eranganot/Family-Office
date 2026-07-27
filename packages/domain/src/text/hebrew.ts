/**
 * Hebrew / RTL text primitives. Pure string functions, no I/O, no dependencies —
 * they live in `domain` so that BOTH `ingestion` (document parsing) and
 * `engine-operations` (merchant-key normalisation) share one implementation.
 * The boundary rules forbid engine→ingestion, and duplicating this logic in two
 * places is exactly the kind of drift the dependency matrix exists to prevent.
 *
 * Empirical basis (fixture- and real-format-verified, see docs/architecture/07
 * Appendix B): several Israeli exporters emit Hebrew in VISUAL order —
 * pdf.js on visual-order PDFs produces an exact full character reversal, and
 * some HTML/XLS exports wrap reversed runs in U+202D.
 */

export const HEBREW_RE = /[֐-׿]/;
const NIQQUD_RE = /[֑-ׇ]/g;
/** LRM/RLM, LRE..RLO+PDF, and the isolate family LRI..PDI. */
const BIDI_CONTROL_RE = /[‎‏‪-‮⁦-⁩]/g;

/** Hebrew final forms. Orthographically these may appear ONLY at the end of a word. */
const FINAL_LETTERS = "ךםןףץ"; // ך ם ן ף ץ
const NONFINAL_OF_FINAL: Record<string, string> = {
  "ך": "כ", // ך → כ
  "ם": "מ", // ם → מ
  "ן": "נ", // ן → נ
  "ף": "פ", // ף → פ
  "ץ": "צ", // ץ → צ
};

export function containsHebrew(s: string): boolean {
  return HEBREW_RE.test(s);
}

/** True if the string carries explicit bidi control characters (a reliable reversal signal). */
export function hasBidiControls(s: string): boolean {
  BIDI_CONTROL_RE.lastIndex = 0;
  return BIDI_CONTROL_RE.test(s);
}

export function stripBidiControls(s: string): string {
  return s.replace(BIDI_CONTROL_RE, "");
}

/** Strip niqqud/cantillation and bidi controls; collapse whitespace. */
export function cleanHebrew(s: string): string {
  return s.replace(NIQQUD_RE, "").replace(BIDI_CONTROL_RE, "").replace(/\s+/g, " ").trim();
}

export function reverseChars(s: string): string {
  return [...s].reverse().join("");
}

/**
 * Lexicon-INDEPENDENT visual-order detector.
 *
 * A Hebrew final letter (ך ם ן ף ץ) can legally occur only as the LAST character
 * of a word. If final letters appear word-initially more often than word-finally,
 * the run is reversed. This is an orthographic invariant, so unlike a keyword
 * lexicon it works on arbitrary merchant names — which is exactly what
 * transaction descriptions are.
 *
 * Returns a score: > 0 means "looks reversed", < 0 means "looks correct", 0 = unknown.
 */
export function visualOrderScore(s: string): number {
  const words = stripBidiControls(s).split(/\s+/).filter((w) => HEBREW_RE.test(w));
  let score = 0;
  for (const w of words) {
    const chars = [...w].filter((c) => HEBREW_RE.test(c));
    if (chars.length < 2) continue;
    const first = chars[0]!;
    const last = chars[chars.length - 1]!;
    if (FINAL_LETTERS.includes(first)) score += 1;
    if (FINAL_LETTERS.includes(last)) score -= 1;
  }
  return score;
}

export function looksVisualOrder(s: string): boolean {
  return visualOrderScore(s) > 0;
}

/**
 * Repair a visual-order line to logical order.
 *
 * Strategy: explicit bidi controls or a positive final-letter score are decisive.
 * A caller-supplied lexicon is used only as a tie-breaker when the orthographic
 * signal is neutral (e.g. a single short word with no final letters).
 */
export function repairVisualOrder(line: string, lexicon: readonly string[] = []): string {
  if (!HEBREW_RE.test(line)) return line;
  const hadControls = hasBidiControls(line);
  const s = stripBidiControls(line);

  const score = visualOrderScore(s);
  if (score > 0) return reverseChars(s);
  if (score < 0) return s;

  if (lexicon.length > 0) {
    const hits = (x: string) => lexicon.reduce((n, w) => (x.includes(w) ? n + 1 : n), 0);
    const reversed = reverseChars(s);
    if (hits(reversed) > hits(s)) return reversed;
    return s;
  }
  // Neutral orthography and no lexicon: an explicit LRO/RLO wrapper is the last signal.
  return hadControls ? reverseChars(s) : s;
}

/**
 * Fold Hebrew final forms to their base letters. Used ONLY for building match keys
 * (so "שוקי" written with a final letter variant still matches) — never for display.
 */
export function foldHebrewFinals(s: string): string {
  return [...s].map((c) => NONFINAL_OF_FINAL[c] ?? c).join("");
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
    .map((tok) => (HEBREW_RE.test(tok) ? reverseChars(tok) : tok))
    .join("");
}
