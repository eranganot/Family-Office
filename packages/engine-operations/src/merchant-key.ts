import { cleanHebrew, containsHebrew, foldHebrewFinals, repairVisualOrder } from "@wealthos/domain";

export { stripBidiControls } from "@wealthos/domain";
export { repairVisualOrder as repairVisualOrderHebrew } from "@wealthos/domain";

/**
 * Hebrew keywords that actually appear in Israeli bank/card transaction lines.
 * Used only as a tie-breaker when the orthographic (final-letter) signal is neutral.
 * Sourced from the real statement formats catalogued in docs/architecture/07 Appendix B.
 */
export const IL_TXN_LEXICON = [
  "תשלום", "תשלומים", "מתוך", "הוראת", "קבע", "עסקה", "עסקאות", "חיוב", "זיכוי", "יתרה",
  "משכורת", "העברה", "הפקדה", "משיכה", "שיק", "כרטיס", "אשראי", "ריבית", "עמלה", "עמלות",
  "מזומן", "החזר", "הנחה", "ביטוח", "חשמל", "מים", "ארנונה", "משכנתא", "דמי", "מנוי",
];

/** Tokens that carry no identifying signal and only fragment the key. */
const NOISE_TOKENS = new Set([
  "בעמ", "בע\"מ", "מ", "ltd", "inc", "llc", "co", "ה", "של", "את",
]);

/**
 * Normalise a transaction description into a stable merchant key.
 *
 * Deterministic and reproducible (owner decision D3 — no LLM anywhere): the same
 * description always yields the same key, so a classification rule keyed on it is
 * replayable from a snapshot. Steps, in order:
 *
 *   1. repair visual-order Hebrew (real statements ship reversed text)
 *   2. strip bidi controls, niqqud, collapse whitespace
 *   3. uppercase Latin; fold Hebrew final forms (match-only, never for display)
 *   4. drop terminal/branch/reference digit runs, which differ per transaction
 *      for the SAME merchant and would otherwise defeat grouping entirely
 *   5. drop punctuation and known noise tokens; join remaining tokens with "_"
 *
 * Returns "" when nothing identifying survives — callers must treat that as
 * "unrecognised merchant" and route to Suspense rather than inventing a key.
 */
export function normalizeMerchantKey(rawDescription: string): string {
  if (!rawDescription) return "";

  const repaired = containsHebrew(rawDescription)
    ? repairVisualOrder(rawDescription, IL_TXN_LEXICON)
    : rawDescription;

  let s = cleanHebrew(repaired);

  // Card-network / gateway prefixes that prefix the real merchant name.
  s = s.replace(/\b(PAYPAL|SQ|SUMUP|TRANSFER|POS|EMV)\s*[*_-]\s*/gi, "");

  const tokens = s
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Pure digit runs (terminal ids, voucher numbers, branch codes) are per-transaction noise.
    .filter((t) => !/^\d+$/.test(t))
    // Mixed alphanumerics with 4+ digits are almost always reference codes (e.g. "P43CD5B1CB").
    .filter((t) => (t.match(/\d/g) ?? []).length < 4)
    .map((t) => (containsHebrew(t) ? foldHebrewFinals(t) : t))
    .filter((t) => !NOISE_TOKENS.has(t) && !NOISE_TOKENS.has(t.toLowerCase()))
    .filter((t) => t.length > 1);

  return tokens.join("_");
}
