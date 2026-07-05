import type { RawDataPayload, RawItem } from "./raw-payload";

/**
 * LedgerFactory: the ONLY constructor of canonical items from raw payloads.
 * Deterministic. Never throws on bad data. Never guesses: anything unknown,
 * ambiguous, or unparseable becomes a SuspenseDraft with a machine-readable reason.
 */

export const KNOWN_ACCOUNT_TYPES = [
  "BANK_CHECKING", "BANK_SAVINGS", "BANK_DEPOSIT", "BROKERAGE_IL", "BROKERAGE_FOREIGN",
  "PENSION_COMPREHENSIVE", "PENSION_GENERAL", "KUPAT_GEMEL", "GEMEL_LEHASHKAA",
  "KEREN_HISHTALMUT", "IRA_GEMEL", "FOREIGN_RETIREMENT", "CASH_OTHER",
] as const;
export type KnownAccountType = (typeof KNOWN_ACCOUNT_TYPES)[number];

const KNOWN_CURRENCIES = new Set(["ILS", "USD", "EUR"]);

export interface ProvenanceField {
  fieldPath: string;
  originalValue: string;
  originalCurrency?: string | undefined;
  confidence: number;
}

export interface CanonicalAccountDraft {
  kind: "ACCOUNT";
  name: string;
  currency: string;
  externalRef?: string | undefined;
  accountType: KnownAccountType;
  institutionName: string;
  managementFeePct?: string | undefined;
  depositFeePct?: string | undefined;
  trackName?: string | undefined;
  valuation?: { asOf: string; value: string; confidence: number } | undefined;
  provenance: ProvenanceField[];
}

export type SuspenseReason =
  | "UNKNOWN_KIND"
  | "UNSUPPORTED_KIND"
  | "UNKNOWN_ACCOUNT_TYPE"
  | "MISSING_NAME"
  | "MISSING_INSTITUTION"
  | "UNKNOWN_CURRENCY"
  | "UNPARSEABLE_BALANCE"
  | "UNPARSEABLE_DATE";

export interface SuspenseDraft {
  reason: SuspenseReason;
  rawItem: RawItem;
}

export interface FactoryResult {
  canonical: CanonicalAccountDraft[];
  suspense: SuspenseDraft[];
  stats: { total: number; canonical: number; suspense: number };
}

function field(item: RawItem, path: string): { raw: string; normalized?: string | undefined; currency?: string | undefined; confidence: number } | undefined {
  const f = item.fields.find((x) => x.path === path);
  if (!f) return undefined;
  return { raw: f.rawValue, normalized: f.normalizedValue, currency: f.originalCurrency, confidence: f.confidence };
}

function toSuspense(item: RawItem, reason: SuspenseReason): SuspenseDraft {
  return { reason, rawItem: item };
}

/**
 * v1 scope: ACCOUNT items (pension, gemel, hishtalmut, bank, brokerage statements).
 * All other kinds are routed to suspense with UNSUPPORTED_KIND until their factory
 * rules land in later milestones — the pipeline never drops data.
 */
export function buildFromPayload(payload: RawDataPayload): FactoryResult {
  const canonical: CanonicalAccountDraft[] = [];
  const suspense: SuspenseDraft[] = [];

  for (const item of payload.items) {
    if (item.suggestedKind === "UNKNOWN") { suspense.push(toSuspense(item, "UNKNOWN_KIND")); continue; }
    if (item.suggestedKind !== "ACCOUNT") { suspense.push(toSuspense(item, "UNSUPPORTED_KIND")); continue; }

    const name = item.suggestedName?.trim();
    if (!name) { suspense.push(toSuspense(item, "MISSING_NAME")); continue; }

    const accountTypeField = field(item, "accountType");
    const accountType = accountTypeField?.normalized ?? accountTypeField?.raw;
    if (!accountType || !KNOWN_ACCOUNT_TYPES.includes(accountType as KnownAccountType)) {
      suspense.push(toSuspense(item, "UNKNOWN_ACCOUNT_TYPE")); continue;
    }

    const institution = field(item, "institutionName");
    const institutionName = (institution?.normalized ?? institution?.raw)?.trim();
    if (!institutionName) { suspense.push(toSuspense(item, "MISSING_INSTITUTION")); continue; }

    const balance = field(item, "balance");
    const currency = balance?.currency ?? field(item, "currency")?.normalized ?? "ILS";
    if (!KNOWN_CURRENCIES.has(currency)) { suspense.push(toSuspense(item, "UNKNOWN_CURRENCY")); continue; }

    let valuation: CanonicalAccountDraft["valuation"];
    if (balance) {
      if (balance.normalized === undefined) { suspense.push(toSuspense(item, "UNPARSEABLE_BALANCE")); continue; }
      const asOfField = field(item, "balanceAsOf");
      if (asOfField && asOfField.normalized === undefined) { suspense.push(toSuspense(item, "UNPARSEABLE_DATE")); continue; }
      valuation = {
        asOf: asOfField?.normalized ?? payload.extractedAt.slice(0, 10),
        value: balance.normalized,
        confidence: balance.confidence,
      };
    }

    const optional = (path: string) => field(item, path)?.normalized;

    canonical.push({
      kind: "ACCOUNT",
      name,
      currency,
      externalRef: item.externalRef,
      accountType: accountType as KnownAccountType,
      institutionName,
      managementFeePct: optional("managementFeePct"),
      depositFeePct: optional("depositFeePct"),
      trackName: optional("trackName"),
      valuation,
      provenance: item.fields.map((f) => ({
        fieldPath: f.path,
        originalValue: f.rawValue,
        originalCurrency: f.originalCurrency,
        confidence: f.confidence,
      })),
    });
  }

  return {
    canonical,
    suspense,
    stats: { total: payload.items.length, canonical: canonical.length, suspense: suspense.length },
  };
}
