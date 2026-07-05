import type { SnapshotPayload } from "@wealthos/domain";

/**
 * Deterministic multi-year projector v1 — annual steps, REAL terms (base currency,
 * today's purchasing power). No randomness; Monte Carlo will layer on this interface.
 *
 * Documented v1 simplifications (in real terms):
 * - Investable wealth = liquid + retirement pools; grows at `realReturnPct`.
 * - Real estate is held FLAT in real terms (conservative; no speculative appreciation).
 * - Mortgage principal amortizes straight-line to each track's end date. CPI-linked
 *   tracks additionally grow with `inflationDeltaPct` (inflation ABOVE the baseline —
 *   in real terms, linked debt only hurts when inflation exceeds what wages/returns absorb).
 * - Mortgage/loan PAYMENTS are assumed to be inside mapped expense flows (no double count).
 * - Income/expense flows are constant in real terms unless a shock modifies them.
 */

export interface ProjectionParams {
  years: number;
  realReturnPct: number;
  /** Inflation surprise vs baseline, in percentage points; affects CPI-linked debt only. */
  inflationDeltaPct: number;
  /** Permanent change to monthly savings (base currency), e.g. +2000 or -2000. */
  extraMonthlySavings: number;
  /** Temporary income reduction: from startYear, for months, by reductionPct (100 = total loss). */
  incomeShock: { startYear: number; months: number; reductionPct: number } | null;
  /** One-time investable drawdown at the START of `year` (1-based), e.g. 30 = -30%. */
  marketShock: { year: number; drawdownPct: number } | null;
  /** Delta applied to all mortgage track rates (refinance ≈ negative delta). Affects interest cost added to expenses when payments are NOT mapped; v1 uses it to adjust amortization interest metric only. */
  mortgageRateDeltaPct: number;
  /** Stop all income permanently from this year (retirement modelling). Null = never. */
  incomeStopsAtYear: number | null;
}

export const BASELINE_PARAMS: Omit<ProjectionParams, "years" | "realReturnPct"> = {
  inflationDeltaPct: 0,
  extraMonthlySavings: 0,
  incomeShock: null,
  marketShock: null,
  mortgageRateDeltaPct: 0,
  incomeStopsAtYear: null,
};

export interface YearRow {
  year: number;
  income: number;
  expenses: number;
  savings: number;
  investable: number;
  realEstate: number;
  debt: number;
  netWorth: number;
}

export interface GoalOutcome {
  goalId: string;
  name: string;
  targetYear: number | null;
  requiredBase: number | null;
  netWorthAtTarget: number | null;
  investableAtTarget: number | null;
  funded: boolean | null; // null = not computable
}

export interface ProjectionResult {
  rows: YearRow[];
  goalOutcomes: GoalOutcome[];
  terminalNetWorth: number;
  minInvestable: number; // lowest point — resilience indicator
  yearsToDepletion: number | null; // first year investable < 0, if any
}

const round = (n: number) => Math.round(n);

export function project(snapshot: SnapshotPayload, params: ProjectionParams): ProjectionResult {
  const r = params.realReturnPct / 100;

  const RETIREMENT = new Set(["PENSION_COMPREHENSIVE", "PENSION_GENERAL", "KUPAT_GEMEL", "IRA_GEMEL", "FOREIGN_RETIREMENT"]);
  let investable = 0;
  let realEstate = 0;
  const tracks: Array<{ principal: number; ratePct: number; cpiLinked: boolean; yearsLeft: number }> = [];
  let otherDebt = 0;

  const startYear = new Date(snapshot.takenAt).getFullYear();
  for (const item of snapshot.items) {
    const v = item.valueBase ?? 0;
    if (item.kind === "ACCOUNT" || item.kind === "OTHER_ASSET") investable += v;
    else if (item.kind === "REAL_ESTATE") realEstate += v;
    else if (item.kind === "MORTGAGE" && item.mortgageTracks) {
      for (const t of item.mortgageTracks) {
        const yearsLeft = Math.max((new Date(t.endDate).getFullYear() - startYear), 1);
        tracks.push({ principal: t.principalRemaining, ratePct: t.annualRatePct + params.mortgageRateDeltaPct, cpiLinked: t.cpiLinked, yearsLeft });
      }
    } else if (item.kind === "LOAN" || item.kind === "OTHER_LIABILITY") otherDebt += v;
    void RETIREMENT;
  }

  const monthlyIncome = snapshot.items
    .filter((i) => i.cashFlow?.direction === "IN" && i.cashFlow.amountBase !== null)
    .reduce((s, i) => s + normalizeMonthly(i.cashFlow!.amountBase!, i.cashFlow!.frequency), 0);
  const monthlyExpenses = snapshot.items
    .filter((i) => i.cashFlow?.direction === "OUT" && i.cashFlow.amountBase !== null)
    .reduce((s, i) => s + normalizeMonthly(i.cashFlow!.amountBase!, i.cashFlow!.frequency), 0);

  const rows: YearRow[] = [];
  let minInvestable = investable;
  let yearsToDepletion: number | null = null;

  for (let year = 1; year <= params.years; year++) {
    // Shocks at the start of the year
    if (params.marketShock && params.marketShock.year === year) {
      investable *= 1 - params.marketShock.drawdownPct / 100;
    }

    const incomeMonths = 12;
    let incomeFactor = 1;
    if (params.incomeStopsAtYear !== null && year >= params.incomeStopsAtYear) {
      incomeFactor = 0;
    } else if (params.incomeShock && year >= params.incomeShock.startYear) {
      const monthsIntoShock = (year - params.incomeShock.startYear) * 12;
      const remaining = Math.max(Math.min(params.incomeShock.months - monthsIntoShock, 12), 0);
      if (remaining > 0) {
        const shockedShare = remaining / 12;
        incomeFactor = 1 - shockedShare * (params.incomeShock.reductionPct / 100);
      }
    }

    const income = monthlyIncome * incomeMonths * incomeFactor;
    const expenses = monthlyExpenses * 12;
    const savings = income - expenses + params.extraMonthlySavings * 12;

    // Wealth grows, then absorbs the year's savings (mid-year approximation: half-growth on flows)
    investable = investable * (1 + r) + savings * (1 + r / 2);
    if (investable < minInvestable) minInvestable = investable;
    if (investable < 0 && yearsToDepletion === null) yearsToDepletion = year;

    // Debt dynamics
    let debt = otherDebt;
    for (const t of tracks) {
      if (t.yearsLeft <= 0) continue;
      if (t.cpiLinked && params.inflationDeltaPct !== 0) t.principal *= 1 + params.inflationDeltaPct / 100;
      t.principal -= t.principal / t.yearsLeft; // straight-line amortization
      t.yearsLeft -= 1;
      debt += Math.max(t.principal, 0);
    }

    rows.push({
      year: startYear + year,
      income: round(income),
      expenses: round(expenses),
      savings: round(savings),
      investable: round(investable),
      realEstate: round(realEstate),
      debt: round(debt),
      netWorth: round(investable + realEstate - debt),
    });
  }

  const goalOutcomes: GoalOutcome[] = snapshot.goals.map((g) => {
    if (!g.targetDate || g.requiredFundingBase === null) {
      return { goalId: g.id, name: g.name, targetYear: g.targetDate ? new Date(g.targetDate).getFullYear() : null, requiredBase: g.requiredFundingBase, netWorthAtTarget: null, investableAtTarget: null, funded: null };
    }
    const targetYear = new Date(g.targetDate).getFullYear();
    const row = rows.find((x) => x.year === targetYear) ?? rows[rows.length - 1];
    if (!row || targetYear > rows[rows.length - 1]!.year) {
      return { goalId: g.id, name: g.name, targetYear, requiredBase: g.requiredFundingBase, netWorthAtTarget: null, investableAtTarget: null, funded: null };
    }
    return {
      goalId: g.id,
      name: g.name,
      targetYear,
      requiredBase: g.requiredFundingBase,
      netWorthAtTarget: row.netWorth,
      investableAtTarget: row.investable,
      funded: row.investable >= g.requiredFundingBase,
    };
  });

  return {
    rows,
    goalOutcomes,
    terminalNetWorth: rows[rows.length - 1]?.netWorth ?? 0,
    minInvestable: round(minInvestable),
    yearsToDepletion,
  };
}

function normalizeMonthly(amount: number, frequency: string): number {
  if (frequency === "MONTHLY") return amount;
  if (frequency === "ANNUAL") return amount / 12;
  return 0; // ONE_TIME flows are not recurring
}
