/**
 * Identifying WHICH card a statement belongs to, and recognising the matching
 * aggregate line on a bank statement.
 *
 * The owner's bank shows each card bill as ONE aggregate debit carrying the card's
 * last 4 digits ("ישראכרט בע"מ - 6170"), while the card statement itemises the same
 * money. Import both without linking them and every card expense counts twice.
 */

/** Card issuers that appear as settlement lines on Israeli bank statements. */
const ISSUER_PATTERNS = [
  "ישראכרט", "כרטיסי אשראי", "כאל", "ויזה", "מקס איט", "דיינרס", "אמריקן אקספרס", "לאומי קארד",
];

export interface SettlementRef {
  /** Last 4 digits of the card the bank line settles. */
  last4: string;
  issuerText: string;
}

/**
 * Recognise a bank line as a card settlement and pull out the card's last 4.
 * Returns undefined for anything that is not clearly a card bill — a false positive
 * here would silently erase a real expense from the month.
 */
export function parseSettlementLine(description: string): SettlementRef | undefined {
  const issuer = ISSUER_PATTERNS.find((p) => description.includes(p));
  if (!issuer) return undefined;

  // FIBI puts the card number last ("ישראכרט בע\"מ - 6170"); OneZero puts it in the
  // middle ("13795992/1069/ישראכרט בע\"מ). Prefer a trailing group, else take the last
  // standalone 4-digit token. Requiring an issuer name first is what keeps this safe:
  // a false positive here would exclude a real expense from the month.
  const trailing = /(\d{4})\s*$/.exec(description.trim());
  if (trailing) return { last4: trailing[1]!, issuerText: issuer };

  const groups = [...description.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map((m) => m[1]!);
  const last = groups[groups.length - 1];
  return last ? { last4: last, issuerText: issuer } : undefined;
}

/**
 * Determine which card a CARD statement covers.
 *
 * Tried in order of reliability: the document text (Isracard prints
 * "פלטינה מאסטרקארד | 1069"), then the filename ("1069_07_2026.pdf"). Returns
 * undefined rather than guessing — an unlinked statement merely stays unlinked,
 * whereas a WRONG link would suppress a genuine bank charge.
 */
export function detectCardLast4(documentText: string, filename: string): string | undefined {
  const fromText = /\|\s*(\d{4})\b/.exec(documentText) ?? /\b(\d{4})\s*\|/.exec(documentText);
  if (fromText) return fromText[1];
  const fromName = /(?:^|[^\d])(\d{4})(?:[^\d]|$)/.exec(filename);
  return fromName?.[1];
}
