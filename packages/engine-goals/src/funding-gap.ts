import Decimal from "decimal.js";

/**
 * FundingGap engine v1 — deterministic, conservative, fully explainable.
 *
 * Pool model (documented policy, not configurable in v1):
 * - LIQUID: bank/brokerage/gemel-lehashkaa/hishtalmut accounts, cash, other assets.
 * - RETIREMENT: pension (comprehensive/general), kupat gemel, IRA, foreign retirement.
 * Retirement-type goals draw from RETIREMENT first, then LIQUID.
 * All other goals draw from LIQUID only (retirement money is not for a car).
 *
 * Allocation: goals sorted by priority (1 = highest); each goal claims from its pool(s)
 * sequentially. Projection: future value at target date under a single conservative real
 * return from the AssumptionRegistry; required monthly saving closes the remaining gap
 * via a standard annuity. No randomness, no guessing: goals lacking a target date or
 * required funding are reported as NOT_COMPUTABLE with the reason.
 */

export type Pool = "LIQUID" | "RETIREMENT";

export interface GoalInput {
  id: string;
  name: string;
  type: string;
  priority: number;
  targetDate: Date | null;
  requiredFundingILS: string | null;
}

export interface AssetInput {
  id: string;
  kind: string;
  accountType?: string | undefined;
  /** Latest verified valuation converted to ILS; null = excluded upstream. */
  valueILS: string | null;
  verified: boolean;
  /** B7: if set, this asset is reserved for that goal (owner intent) and leaves the shared pools. */
  earmarkedGoalId?: string | null;
}

export interface GoalGapResult {
  goalId: string;
  name: string;
  computable: boolean;
  reason?: "NO_TARGET_DATE" | "NO_REQUIRED_FUNDING" | "TARGET_IN_PAST" | undefined;
  allocatedNowILS?: string;
  /** Portion of allocatedNow that came from accounts earmarked to this goal. */
  earmarkedNowILS?: string;
  projectedValueILS?: string;
  requiredILS?: string;
  gapILS?: string;
  requiredMonthlySavingILS?: string;
  yearsToTarget?: number;
}

export interface FundingGapReport {
  results: GoalGapResult[];
  pools: { liquidILS: string; retirementILS: string };
  excludedUnverifiedCount: number;
  realReturnPctUsed: number;
}

const RETIREMENT_TYPES = new Set(["PENSION_COMPREHENSIVE", "PENSION_GENERAL", "KUPAT_GEMEL", "IRA_GEMEL", "FOREIGN_RETIREMENT"]);
const ASSET_KINDS = new Set(["ACCOUNT", "OTHER_ASSET"]);

export function classifyPool(asset: AssetInput): Pool | null {
  if (!ASSET_KINDS.has(asset.kind)) return null;
  if (asset.kind === "ACCOUNT" && asset.accountType && RETIREMENT_TYPES.has(asset.accountType)) return "RETIREMENT";
  return "LIQUID";
}

export function computeFundingGaps(
  goals: GoalInput[],
  assets: AssetInput[],
  realReturnPct: number,
  now: Date,
): FundingGapReport {
  let liquid = new Decimal(0);
  let retirement = new Decimal(0);
  let excludedUnverified = 0;

  const earmarkedByGoal = new Map<string, Decimal>();
  for (const asset of assets) {
    const pool = classifyPool(asset);
    if (pool === null || asset.valueILS === null) continue;
    if (!asset.verified) { excludedUnverified += 1; continue; }
    if (asset.earmarkedGoalId) {
      // Pinned to a goal: reserved for it, not part of the shared pools (owner intent overrides pool policy).
      earmarkedByGoal.set(asset.earmarkedGoalId, (earmarkedByGoal.get(asset.earmarkedGoalId) ?? new Decimal(0)).plus(asset.valueILS));
      continue;
    }
    if (pool === "RETIREMENT") retirement = retirement.plus(asset.valueILS);
    else liquid = liquid.plus(asset.valueILS);
  }

  const pools = { LIQUID: liquid, RETIREMENT: retirement };
  const r = new Decimal(realReturnPct).dividedBy(100);
  const monthlyRate = new Decimal(1).plus(r).pow(new Decimal(1).dividedBy(12)).minus(1);
  const fix = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2);

  const results: GoalGapResult[] = [];
  for (const goal of [...goals].sort((a, b) => a.priority - b.priority)) {
    if (!goal.targetDate) { results.push(notComputable(goal, "NO_TARGET_DATE")); continue; }
    if (!goal.requiredFundingILS) { results.push(notComputable(goal, "NO_REQUIRED_FUNDING")); continue; }
    const years = (goal.targetDate.getTime() - now.getTime()) / (365.25 * 86_400_000);
    if (years <= 0) { results.push(notComputable(goal, "TARGET_IN_PAST")); continue; }

    const required = new Decimal(goal.requiredFundingILS);
    const drawOrder: Pool[] = goal.type === "RETIREMENT" || goal.type === "FINANCIAL_INDEPENDENCE"
      ? ["RETIREMENT", "LIQUID"]
      : ["LIQUID"];

    // Allocate up to the PRESENT VALUE of the requirement (conservative: PV at the same real return).
    const presentValueNeeded = required.dividedBy(new Decimal(1).plus(r).pow(years));
    let allocated = new Decimal(0);
    // Earmarked accounts fund their goal first, capped at the present value needed.
    const earmarkAvailable = earmarkedByGoal.get(goal.id) ?? new Decimal(0);
    const earmarkTake = Decimal.min(earmarkAvailable, presentValueNeeded);
    allocated = allocated.plus(earmarkTake);
    for (const pool of drawOrder) {
      const take = Decimal.min(pools[pool], presentValueNeeded.minus(allocated));
      if (take.gt(0)) {
        pools[pool] = pools[pool].minus(take);
        allocated = allocated.plus(take);
      }
      if (allocated.gte(presentValueNeeded)) break;
    }

    const projected = allocated.times(new Decimal(1).plus(r).pow(years));
    const gap = Decimal.max(required.minus(projected), 0);
    const months = Math.max(Math.round(years * 12), 1);
    // Annuity-due-free standard: FV = P × [((1+i)^n − 1)/i]; P = gap / factor
    const factor = monthlyRate.isZero()
      ? new Decimal(months)
      : new Decimal(1).plus(monthlyRate).pow(months).minus(1).dividedBy(monthlyRate);
    const monthly = gap.isZero() ? new Decimal(0) : gap.dividedBy(factor);

    results.push({
      goalId: goal.id,
      name: goal.name,
      computable: true,
      allocatedNowILS: fix(allocated),
      earmarkedNowILS: fix(earmarkTake),
      projectedValueILS: fix(projected),
      requiredILS: fix(required),
      gapILS: fix(gap),
      requiredMonthlySavingILS: fix(monthly),
      yearsToTarget: Math.round(years * 10) / 10,
    });
  }

  return {
    results,
    pools: { liquidILS: fix(liquid), retirementILS: fix(retirement) },
    excludedUnverifiedCount: excludedUnverified,
    realReturnPctUsed: realReturnPct,
  };
}

function notComputable(goal: GoalInput, reason: GoalGapResult["reason"]): GoalGapResult {
  return { goalId: goal.id, name: goal.name, computable: false, reason };
}
