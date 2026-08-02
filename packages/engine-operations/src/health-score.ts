/**
 * M42 — the Household Financial Health Score.
 *
 * `health_score_weights` has been seeded since M36 ({ cashflow 30, liquidity 25,
 * leakage 15, execution 15, goals 15 }) and consumed by nothing. This is the consumer.
 *
 * ---------------------------------------------------------------------------
 * WHY A COMPOSITE SCORE IS THE MOST DANGEROUS THING IN THIS MODULE
 * ---------------------------------------------------------------------------
 * Every other output here names what it is: a saving, a spread, a deadline. A single
 * number out of 100 names nothing, and it is read as a verdict. Three rules keep it
 * honest, all of them learned the hard way elsewhere in this codebase:
 *
 *  1. A COMPONENT WITH NO INPUT IS REFUSED, NOT SCORED ZERO. Zero is a terrible score;
 *     "not measured" is not a score at all. Scoring an unmeasured component as zero
 *     would make an unmapped household look reckless rather than unmapped — the same
 *     mistake as counting a month with no FX rate as zero drag.
 *
 *  2. THE COMPOSITE REFUSES BELOW A WEIGHT-COVERAGE FLOOR. Renormalising two of five
 *     components up to 100% produces a confident number describing a fraction of the
 *     household. Coverage is reported either way, so a 92 built on 45% of the weight is
 *     never displayed as simply "92".
 *
 *  3. THE SCORE NEVER CAUSES AN ACTION. It is a summary of findings that already exist,
 *     each of which carries its own rationale. Nothing downstream may branch on it.
 */

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export type HealthComponentKey = "cashflow" | "liquidity" | "leakage" | "execution" | "goals";

export type HealthComponent =
  | { key: HealthComponentKey; ok: true; score: number; weight: number; detail: string }
  | { key: HealthComponentKey; ok: false; weight: number; reason: string };

export interface HealthScoreInput {
  weights: Record<HealthComponentKey, number>;
  /** Minimum share of total weight that must be measurable before a composite is emitted. */
  minWeightCoveragePct: number;

  /** Verified monthly surplus and the income it came from. `null` = not measured. */
  monthlySurplusBase: number | null;
  monthlyIncomeBase: number | null;

  /** Liquid buffer actually available, and the target it is measured against. */
  workingCapitalAvailableBase: number | null;
  workingCapitalTargetBase: number | null;

  /** Financial drag and the expense base it is a share of. */
  monthlyLeakageBase: number | null;
  monthlyExpensesBase: number | null;

  /** Operational follow-through: what was committed to, and what got finished. */
  actionsCommitted: number | null;
  actionsCompleted: number | null;

  /**
   * Goal funding: required vs actually funded, in base currency.
   *
   * ⚠️ `goalsFundedBase` must be CAPPED PER GOAL by the caller. An uncapped sum of
   * projections lets an over-funded retirement lend its excess to an unfunded education
   * goal, and the household reads 100% while a goal has nothing behind it.
   */
  goalsRequiredBase: number | null;
  goalsFundedBase: number | null;

  /** M43 — optional: how many goals the two figures above actually cover. Reported in
   *  the component detail so a partial denominator cannot pass as a complete one. */
  goalsComputable?: number | undefined;
  goalsTotal?: number | undefined;
}

export type HealthScore =
  | {
      ok: true;
      score: number;
      weightCoveredPct: number;
      components: HealthComponent[];
      /** Components that could not be measured — named, never silently dropped. */
      unmeasured: HealthComponentKey[];
    }
  | {
      ok: false;
      reason: "INSUFFICIENT_COVERAGE";
      weightCoveredPct: number;
      minWeightCoveragePct: number;
      components: HealthComponent[];
      unmeasured: HealthComponentKey[];
    };

/** Surplus as a share of income. 20%+ of income converting to surplus scores full. */
function cashflowComponent(input: HealthScoreInput, weight: number): HealthComponent {
  const { monthlySurplusBase: s, monthlyIncomeBase: i } = input;
  if (s === null || i === null) {
    return { key: "cashflow", ok: false, weight, reason: "SURPLUS_OR_INCOME_NOT_MEASURED" };
  }
  if (i <= 0) return { key: "cashflow", ok: false, weight, reason: "NO_INCOME_OBSERVED" };
  const rate = (s / i) * 100;
  // Negative surplus floors at 0 rather than going negative: the composite is a 0-100
  // scale, and a -40 component would silently drag unrelated components down with it.
  return {
    key: "cashflow",
    ok: true,
    weight,
    score: clamp((rate / 20) * 100),
    detail: `${round2(rate)}%`,
  };
}

/** Working capital against its target. At or above target scores full. */
function liquidityComponent(input: HealthScoreInput, weight: number): HealthComponent {
  const { workingCapitalAvailableBase: a, workingCapitalTargetBase: target } = input;
  if (a === null || target === null) {
    return { key: "liquidity", ok: false, weight, reason: "WORKING_CAPITAL_NOT_MEASURED" };
  }
  if (target <= 0) return { key: "liquidity", ok: false, weight, reason: "NO_TARGET_SET" };
  return {
    key: "liquidity",
    ok: true,
    weight,
    score: clamp((a / target) * 100),
    detail: `${round2((a / target) * 100)}%`,
  };
}

/** Drag as a share of expenses. INVERTED: less leakage is a better score. */
function leakageComponent(input: HealthScoreInput, weight: number): HealthComponent {
  const { monthlyLeakageBase: l, monthlyExpensesBase: e } = input;
  if (l === null || e === null) {
    return { key: "leakage", ok: false, weight, reason: "LEAKAGE_NOT_MEASURED" };
  }
  if (e <= 0) return { key: "leakage", ok: false, weight, reason: "NO_EXPENSES_OBSERVED" };
  // 5% of expenses lost to fees, interest and spreads scores zero; zero leakage scores
  // full. Beyond 5% it floors rather than going negative.
  const share = (Math.abs(l) / e) * 100;
  return {
    key: "leakage",
    ok: true,
    weight,
    score: clamp(100 - (share / 5) * 100),
    detail: `${round2(share)}%`,
  };
}

/**
 * Follow-through: of the work the owner COMMITTED to, how much got finished.
 *
 * Committed = accepted + completed, deliberately excluding proposals. Counting
 * everything the engine suggested would score the household on the engine's
 * enthusiasm rather than on the owner's execution.
 */
function executionComponent(input: HealthScoreInput, weight: number): HealthComponent {
  const { actionsCommitted: c, actionsCompleted: done } = input;
  if (c === null || done === null) {
    return { key: "execution", ok: false, weight, reason: "NO_ACTION_HISTORY" };
  }
  if (c === 0) {
    // Nothing committed is not 0% execution — there was nothing to execute. Refused
    // rather than scored, so a household that has just started does not read as failing.
    return { key: "execution", ok: false, weight, reason: "NOTHING_COMMITTED_YET" };
  }
  return {
    key: "execution",
    ok: true,
    weight,
    score: clamp((done / c) * 100),
    detail: `${done}/${c}`,
  };
}

function goalsComponent(input: HealthScoreInput, weight: number): HealthComponent {
  const { goalsRequiredBase: req, goalsFundedBase: funded } = input;
  if (req === null || funded === null) {
    return { key: "goals", ok: false, weight, reason: "GOALS_NOT_MEASURED" };
  }
  if (req <= 0) return { key: "goals", ok: false, weight, reason: "NO_ACTIVE_GOALS" };
  /*
   * M43 — the detail carries HOW MANY goals the percentage covers, when the caller knows.
   *
   * Goals lacking a target date or a required amount are not computable, and the caller
   * excludes them rather than scoring them as unfunded (an empty form field is a data
   * gap, not a financial failure). But "80% funded" over three of five goals is a
   * different claim from "80% funded", and only one of them is honest.
   *
   * This is the same rule the composite already applies to itself by publishing its
   * weight coverage beside the score. A ratio whose denominator is partial has to say so.
   */
  const pct = round2((funded / req) * 100);
  const counted = input.goalsComputable;
  const total = input.goalsTotal;
  const coverage =
    typeof counted === "number" && typeof total === "number" && total > counted
      ? ` (${counted}/${total} goals)`
      : "";
  return {
    key: "goals",
    ok: true,
    weight,
    score: clamp((funded / req) * 100),
    detail: `${pct}%${coverage}`,
  };
}

export function computeHealthScore(input: HealthScoreInput): HealthScore {
  const w = input.weights;
  const components: HealthComponent[] = [
    cashflowComponent(input, w.cashflow),
    liquidityComponent(input, w.liquidity),
    leakageComponent(input, w.leakage),
    executionComponent(input, w.execution),
    goalsComponent(input, w.goals),
  ];

  const measured = components.filter((c): c is Extract<HealthComponent, { ok: true }> => c.ok);
  const unmeasured = components.filter((c) => !c.ok).map((c) => c.key);

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const coveredWeight = measured.reduce((s, c) => s + c.weight, 0);
  const weightCoveredPct = totalWeight > 0 ? round2((coveredWeight / totalWeight) * 100) : 0;

  if (coveredWeight <= 0 || weightCoveredPct < input.minWeightCoveragePct) {
    return {
      ok: false,
      reason: "INSUFFICIENT_COVERAGE",
      weightCoveredPct,
      minWeightCoveragePct: input.minWeightCoveragePct,
      components,
      unmeasured,
    };
  }

  // Renormalised over MEASURED weight only, which is why the coverage figure travels
  // with the score: 88 over 60% of the weight is a different claim from 88 over 100%.
  const score = clamp(
    measured.reduce((s, c) => s + c.score * c.weight, 0) / coveredWeight,
  );

  return { ok: true, score, weightCoveredPct, components, unmeasured };
}
