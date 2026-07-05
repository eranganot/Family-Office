import Decimal from "decimal.js";
import type { CurrencyCode } from "../values/currency-code";

/** Minimal projection of a ledger item for consolidation. */
export interface NetWorthItem {
  id: string;
  name: string;
  kind: string;
  currency: CurrencyCode;
  /** Latest valuation amount, or null when the item has no valuation yet. */
  latestValue: string | null;
}

export interface FxRateInput {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: string;
}

const ASSET_KINDS = new Set(["ACCOUNT", "REAL_ESTATE", "OTHER_ASSET"]);
const LIABILITY_KINDS = new Set(["MORTGAGE", "LOAN", "OTHER_LIABILITY"]);

export interface NetWorthReport {
  baseCurrency: CurrencyCode;
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  byKind: Record<string, string>;
  /** Gross exposure per original currency (assets + liabilities magnitude), pre-conversion. */
  byCurrency: Record<string, string>;
  /** Items excluded from totals — the report never guesses. */
  excluded: Array<{ id: string; name: string; reason: "NO_VALUATION" | "NO_FX_RATE" }>;
}

/**
 * Consolidates the household to base currency. Conservative by construction:
 * items without a valuation or without an FX rate are EXCLUDED and reported,
 * never estimated. Cash flow and insurance are not stock values and are ignored.
 */
export function calculateNetWorth(
  items: NetWorthItem[],
  fxRates: FxRateInput[],
  baseCurrency: CurrencyCode,
): NetWorthReport {
  const rates = new Map<string, Decimal>();
  for (const r of fxRates) rates.set(`${r.from}->${r.to}`, new Decimal(r.rate));

  const convert = (amount: Decimal, from: CurrencyCode): Decimal | null => {
    if (from === baseCurrency) return amount;
    const direct = rates.get(`${from}->${baseCurrency}`);
    if (direct) return amount.times(direct);
    const inverse = rates.get(`${baseCurrency}->${from}`);
    if (inverse && !inverse.isZero()) return amount.dividedBy(inverse);
    return null;
  };

  let assets = new Decimal(0);
  let liabilities = new Decimal(0);
  const byKind = new Map<string, Decimal>();
  const byCurrency = new Map<string, Decimal>();
  const excluded: NetWorthReport["excluded"] = [];

  for (const item of items) {
    const isAsset = ASSET_KINDS.has(item.kind);
    const isLiability = LIABILITY_KINDS.has(item.kind);
    if (!isAsset && !isLiability) continue;
    if (item.latestValue === null) {
      excluded.push({ id: item.id, name: item.name, reason: "NO_VALUATION" });
      continue;
    }
    const original = new Decimal(item.latestValue);
    const converted = convert(original, item.currency);
    if (converted === null) {
      excluded.push({ id: item.id, name: item.name, reason: "NO_FX_RATE" });
      continue;
    }
    byCurrency.set(item.currency, (byCurrency.get(item.currency) ?? new Decimal(0)).plus(original.abs()));
    byKind.set(item.kind, (byKind.get(item.kind) ?? new Decimal(0)).plus(converted));
    if (isAsset) assets = assets.plus(converted);
    else liabilities = liabilities.plus(converted);
  }

  const fix = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2);
  return {
    baseCurrency,
    totalAssets: fix(assets),
    totalLiabilities: fix(liabilities),
    netWorth: fix(assets.minus(liabilities)),
    byKind: Object.fromEntries([...byKind].map(([k, v]) => [k, fix(v)])),
    byCurrency: Object.fromEntries([...byCurrency].map(([k, v]) => [k, fix(v)])),
    excluded,
  };
}
