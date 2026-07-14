import type { SnapshotPayload } from "@wealthos/domain";
import { projectPath, type ProjectionParams } from "./projector";

/**
 * Monte Carlo layer over the deterministic projector (C2). Samples annual real
 * returns ~ Normal(realReturnPct, volatilityPct) — capturing sequence-of-returns
 * risk — and reports P10/P50/P90 net-worth and investable bands per year, per-goal
 * success probabilities, and the probability of depletion. Uses a seeded PRNG so
 * the same inputs always reproduce the same bands (needed for reproducibility pins).
 */

export interface MonteCarloParams {
  runs: number;
  /** Annual real-return volatility (standard deviation), percentage points. */
  volatilityPct: number;
  seed: number;
}

export interface MonteCarloYear {
  year: number;
  netWorthP10: number;
  netWorthP50: number;
  netWorthP90: number;
  investableP10: number;
  investableP50: number;
  investableP90: number;
}

export interface MonteCarloGoal {
  goalId: string;
  name: string;
  targetYear: number | null;
  probabilityFunded: number | null; // null = not computable in the horizon
}

export interface MonteCarloResult {
  runs: number;
  volatilityPct: number;
  years: MonteCarloYear[];
  goals: MonteCarloGoal[];
  depletionProbability: number;
  terminalNetWorthP10: number;
  terminalNetWorthP50: number;
  terminalNetWorthP90: number;
}

/** mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller. */
function nextNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx]!;
}

export function projectMonteCarlo(
  snapshot: SnapshotPayload,
  params: ProjectionParams,
  mc: MonteCarloParams,
): MonteCarloResult {
  const rng = mulberry32(mc.seed);
  const mean = params.realReturnPct / 100;
  const sigma = mc.volatilityPct / 100;
  const years = params.years;

  const nwByYear: number[][] = Array.from({ length: years }, () => []);
  const invByYear: number[][] = Array.from({ length: years }, () => []);
  const goalFundedCount = new Map<string, number>();
  const goalComputable = new Map<string, number>();
  const terminal: number[] = [];
  let depletionCount = 0;

  for (let run = 0; run < mc.runs; run++) {
    const returns = Array.from({ length: years }, () => mean + sigma * nextNormal(rng));
    const res = projectPath(snapshot, params, returns);
    res.rows.forEach((row, i) => {
      nwByYear[i]!.push(row.netWorth);
      invByYear[i]!.push(row.investable);
    });
    terminal.push(res.terminalNetWorth);
    if (res.yearsToDepletion !== null) depletionCount += 1;
    for (const g of res.goalOutcomes) {
      if (g.funded === null) continue;
      goalComputable.set(g.goalId, (goalComputable.get(g.goalId) ?? 0) + 1);
      if (g.funded) goalFundedCount.set(g.goalId, (goalFundedCount.get(g.goalId) ?? 0) + 1);
    }
  }

  const startYear = new Date(snapshot.takenAt).getFullYear();
  const yearsOut: MonteCarloYear[] = [];
  for (let i = 0; i < years; i++) {
    const nw = [...nwByYear[i]!].sort((a, b) => a - b);
    const inv = [...invByYear[i]!].sort((a, b) => a - b);
    yearsOut.push({
      year: startYear + i + 1,
      netWorthP10: Math.round(percentile(nw, 10)),
      netWorthP50: Math.round(percentile(nw, 50)),
      netWorthP90: Math.round(percentile(nw, 90)),
      investableP10: Math.round(percentile(inv, 10)),
      investableP50: Math.round(percentile(inv, 50)),
      investableP90: Math.round(percentile(inv, 90)),
    });
  }

  const goals: MonteCarloGoal[] = snapshot.goals.map((g) => {
    const computable = goalComputable.get(g.id) ?? 0;
    return {
      goalId: g.id,
      name: g.name,
      targetYear: g.targetDate ? new Date(g.targetDate).getFullYear() : null,
      probabilityFunded: computable > 0 ? (goalFundedCount.get(g.id) ?? 0) / computable : null,
    };
  });

  const termSorted = [...terminal].sort((a, b) => a - b);
  return {
    runs: mc.runs,
    volatilityPct: mc.volatilityPct,
    years: yearsOut,
    goals,
    depletionProbability: mc.runs > 0 ? depletionCount / mc.runs : 0,
    terminalNetWorthP10: Math.round(percentile(termSorted, 10)),
    terminalNetWorthP50: Math.round(percentile(termSorted, 50)),
    terminalNetWorthP90: Math.round(percentile(termSorted, 90)),
  };
}
