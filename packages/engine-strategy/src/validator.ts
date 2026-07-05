/**
 * WealthOS recommends STRATEGY, never products. This validator rejects any draft
 * whose text names a security, fund, ticker, or broker-style instruction.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\b(buy|sell|purchase|short)\s+(shares?|stock|units?)\b/i,
  /\bETF\b/i,
  /\b(S&P\s?500|NASDAQ|Nasdaq-?100|MSCI|FTSE|TA-?(35|125))\b/i,
  /\bticker\b/i,
  /\b[A-Z]{1,4}:[A-Z]{2,5}\b/, // exchange:ticker
  /קרן\s+(מחקה|נאמנות|סל)/, // index/mutual/basket funds (he)
  /(תעודת\s+סל|מנייה|מניית)/,
];

export type ValidationResult = { valid: true } | { valid: false; pattern: string; text: string };

export function validateStrategyText(texts: string[]): ValidationResult {
  for (const text of texts) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) return { valid: false, pattern: pattern.source, text: text.slice(0, 120) };
    }
  }
  return { valid: true };
}
