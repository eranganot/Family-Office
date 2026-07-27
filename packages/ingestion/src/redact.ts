/**
 * PII redaction boundary (docs/architecture/07 §7.1).
 *
 * Applied to every ingested field BEFORE persistence and before any parser or
 * downstream consumer sees it. `Transaction` has no raw-description column by design:
 * only the redacted form is stored. The original bytes remain in `Document`, which is
 * already access-controlled, so the audit trail survives without spreading PII into a
 * table that gets queried, aggregated and rendered constantly.
 *
 * Pure, deterministic and IDEMPOTENT — redact(redact(x)) === redact(x) — so re-running
 * an import can never double-mangle a value. Version-stamped so a rule change is
 * auditable.
 *
 * Design bias: FALSE POSITIVES ARE CHEAPER THAN FALSE NEGATIVES for account and card
 * numbers (losing a few digits of a merchant name costs nothing; leaking a PAN is
 * unacceptable). The one exception is Teudat Zehut, where a naive "any 9 digits" rule
 * would shred legitimate amounts and reference codes — so that check is exact.
 */

export const REDACTION_VERSION = "redact@1.0.0-m38b";

export interface RedactionResult {
  text: string;
  /** What was found, for the import preview's "N fields redacted" summary. */
  hits: RedactionHit[];
  /** Last 4 of the first account/card number seen, safe to keep for reconciliation. */
  counterpartyMasked?: string | undefined;
}

export type RedactionKind = "TEUDAT_ZEHUT" | "IBAN" | "BANK_ACCOUNT" | "CARD_PAN" | "NAME";

export interface RedactionHit {
  kind: RedactionKind;
  /** The masked replacement that was substituted (never the original). */
  replacement: string;
}

const MASK: Record<RedactionKind, string> = {
  TEUDAT_ZEHUT: "[ID]",
  IBAN: "[IBAN]",
  BANK_ACCOUNT: "[ACCT]",
  CARD_PAN: "[CARD]",
  NAME: "[NAME]",
};

/**
 * Israeli ID check digit: pad to 9, multiply digits alternately by 1 and 2, sum the
 * DIGITS of each product, total must be divisible by 10. Validating properly is what
 * lets us redact 9-digit IDs without destroying 9-digit amounts or voucher numbers.
 */
export function isValidTeudatZehut(digits: string): boolean {
  if (!/^\d{5,9}$/.test(digits)) return false;
  const id = digits.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const product = Number(id[i]) * ((i % 2) + 1);
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}

/** Luhn — the standard card-number checksum. */
export function isLuhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const last4 = (s: string): string => s.replace(/\D/g, "").slice(-4);

/**
 * Redact a single free-text field.
 *
 * `memberNames` should be the household's FamilyMember names — statements put the
 * account holder's name in the header of every page, and it is the one piece of PII
 * a generic pattern can never catch.
 */
export function redact(input: string, memberNames: readonly string[] = []): RedactionResult {
  if (!input) return { text: "", hits: [] };

  const hits: RedactionHit[] = [];
  let counterpartyMasked: string | undefined;
  let text = input;

  const note = (kind: RedactionKind): string => {
    hits.push({ kind, replacement: MASK[kind] });
    return MASK[kind];
  };

  // 1. IBAN (IL + 2 check digits + 19 alnum), optionally spaced in groups.
  text = text.replace(/\bIL\d{2}[ -]?(?:[A-Z0-9][ -]?){19}\b/gi, (m) => {
    counterpartyMasked ??= last4(m);
    return note("IBAN");
  });

  // 2. Card PAN: 13-19 digits, optionally separated, validated by Luhn.
  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (!isLuhnValid(digits)) return m;
    counterpartyMasked ??= last4(digits);
    return note("CARD_PAN");
  });

  // 3. Israeli bank account: bank-branch-account, or the common branch-account form
  //    (FIBI prints "65-326475"). The trailing run is required to be >= 5 digits, which
  //    keeps dates ("2026-07-27", "07-27") and short ranges out of the match while still
  //    catching real account numbers. Over-matching here is cheap; under-matching is not.
  text = text.replace(/\b\d{2,3}[-/]\d{3,6}[-/]\d{4,9}\b|\b\d{2,3}[-/]\d{5,9}\b/g, (m) => {
    counterpartyMasked ??= last4(m);
    return note("BANK_ACCOUNT");
  });

  // 4. Teudat Zehut: only when the check digit actually validates.
  text = text.replace(/\b\d{9}\b/g, (m) => (isValidTeudatZehut(m) ? note("TEUDAT_ZEHUT") : m));

  // 5. Household member names, longest first so "Eran Ganot" wins over "Eran".
  const names = [...memberNames]
    .filter((n) => n && n.trim().length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // No \b: it does not work adjacent to Hebrew characters (a known sharp edge in
    // this codebase - the product-reference validator hit the same problem).
    const re = new RegExp(escaped.replace(/\s+/g, "\\s+"), "gi");
    if (re.test(text)) {
      text = text.replace(re, () => note("NAME"));
    }
  }

  return { text: text.replace(/\s{2,}/g, " ").trim(), hits, counterpartyMasked };
}

/** Redact every value of a raw row. Keys are never redacted (they are column names). */
export function redactRow(
  row: Record<string, string>,
  memberNames: readonly string[] = [],
): { row: Record<string, string>; hits: RedactionHit[]; counterpartyMasked?: string | undefined } {
  const out: Record<string, string> = {};
  const hits: RedactionHit[] = [];
  let counterpartyMasked: string | undefined;
  for (const [k, v] of Object.entries(row)) {
    const r = redact(v ?? "", memberNames);
    out[k] = r.text;
    hits.push(...r.hits);
    counterpartyMasked ??= r.counterpartyMasked;
  }
  return { row: out, hits, counterpartyMasked };
}
