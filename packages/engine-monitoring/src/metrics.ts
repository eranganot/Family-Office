import type { SnapshotItem, SnapshotPayload } from "@wealthos/domain";

/**
 * Comparable household metrics derived from a snapshot. These mirror the M6
 * strategy analyzers' pool policy exactly, so drift is measured against the same
 * definitions the strategy was built on. Pure — no DB, no clock.
 */

// Classification mirrors packages/engine-strategy/src/analyzers/pools.ts (documented shared policy).
const RETIREMENT_TYPES = new Set([
  "PENSION_COMPREHENSIVE",
  "PENSION_GENERAL",
  "KUPAT_GEMEL",
  "IRA_GEMEL",
  "FOREIGN_RETIREMENT",
]);

export const isAssetKind = (i: SnapshotItem): boolean => ["ACCOUNT", "REAL_ESTATE", "OTHER_ASSET"].includes(i.kind);
export const isLiabilityKind = (i: SnapshotItem): boolean => ["MORTGAGE", "LOAN", "OTHER_LIABILITY"].includes(i.kind);
export const isRetirement = (i: SnapshotItem): boolean => i.kind === "ACCOUNT" && RETIREMENT_TYPES.has(i.accountType ?? "");
export const isLiquid = (i: SnapshotItem): boolean =>
  (i.kind === "ACCOUNT" && !isRetirement(i)) || i.kind === "OTHER_ASSET";

const CASH_TYPES = new Set(["BANK_CHECKING", "BANK_SAVINGS", "BANK_DEPOSIT", "CASH_OTHER"]);
const isCash = (i: SnapshotItem): boolean => i.kind === "ACCOUNT" && CASH_TYPES.has(i.accountType ?? "");

const valued = (items: SnapshotItem[]): SnapshotItem[] => items.filter((i) => i.valueBase !== null);
const sum = (items: SnapshotItem[]): number => items.reduce((s, i) => s + (i.valueBase ?? 0), 0);

export interface HouseholdMetrics {
  /** Assets minus liabilities in base currency (valued items only). */
  netWorth: number;
  assetsTotal: number;
  liabilitiesTotal: number;
  /** Liquid assets as a share of total assets (0-100), or null when no assets. */
  liquidSharePct: number | null;
  /** Largest single non-real-estate position as a share of assets (0-100), or null. */
  topConcentrationPct: number | null;
  /** Total assets as a share of total required goal funding (0-100+), or null when no funded goals. */
  goalCoveragePct: number | null;
  /** Growth share (0-100) of investable accounts with KNOWN mix (growthSharePct set, cash = defensive); null when nothing is known. Mirrors the M12 allocation analyzer. */
  growthSharePct: number | null;
  itemIds: string[];
}

export function computeMetrics(snapshot: SnapshotPayload): HouseholdMetrics {
  const assets = valued(snapshot.items).filter(isAssetKind);
  const liabilities = valued(snapshot.items).filter(isLiabilityKind);
  const assetsTotal = sum(assets);
  const liabilitiesTotal = sum(liabilities);

  const liquidTotal = sum(assets.filter(isLiquid));
  const liquidSharePct = assetsTotal > 0 ? (liquidTotal / assetsTotal) * 100 : null;

  let topConcentrationPct: number | null = null;
  if (assetsTotal > 0) {
    const nonRe = assets.filter((i) => i.kind !== "REAL_ESTATE");
    const top = nonRe.reduce((m, i) => Math.max(m, (i.valueBase ?? 0) / assetsTotal), 0);
    topConcentrationPct = nonRe.length > 0 ? top * 100 : 0;
  }

  const requiredGoalFunding = snapshot.goals
    .filter((g) => g.requiredFundingBase !== null)
    .reduce((s, g) => s + (g.requiredFundingBase ?? 0), 0);
  const goalCoveragePct = requiredGoalFunding > 0 ? (assetsTotal / requiredGoalFunding) * 100 : null;

  // Growth vs defensive over KNOWN mix only — unknown wrappers are excluded, never guessed (M12 policy).
  let growth = 0;
  let defensive = 0;
  for (const i of assets.filter((a) => a.kind === "ACCOUNT")) {
    const v = i.valueBase ?? 0;
    if (i.growthSharePct !== null && i.growthSharePct !== undefined) {
      growth += (v * i.growthSharePct) / 100;
      defensive += (v * (100 - i.growthSharePct)) / 100;
    } else if (isCash(i)) {
      defensive += v;
    }
  }
  const knownMixTotal = growth + defensive;
  const growthSharePct = knownMixTotal > 0 ? (growth / knownMixTotal) * 100 : null;

  return {
    netWorth: assetsTotal - liabilitiesTotal,
    assetsTotal,
    liabilitiesTotal,
    liquidSharePct,
    topConcentrationPct,
    goalCoveragePct,
    growthSharePct,
    itemIds: snapshot.items.map((i) => i.id),
  };
}
