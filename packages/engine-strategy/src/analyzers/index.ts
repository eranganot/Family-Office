import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";
import { analyzeAllocation } from "./allocation";
import { analyzeConcentration } from "./concentration";
import { analyzeCurrency } from "./currency";
import { analyzeDebt } from "./debt";
import { analyzeInsurance } from "./insurance";
import { analyzeLiquidity } from "./liquidity";
import { analyzeTaxHeadroom } from "./tax-headroom";

export const ANALYZERS = [
  analyzeLiquidity,
  analyzeConcentration,
  analyzeCurrency,
  analyzeTaxHeadroom,
  analyzeDebt,
  analyzeAllocation,
  analyzeInsurance,
] as const;

export function runAnalyzers(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  return ANALYZERS.flatMap((a) => a(snapshot, ctx));
}

export { analyzeAllocation, analyzeConcentration, analyzeCurrency, analyzeDebt, analyzeInsurance, analyzeLiquidity, analyzeTaxHeadroom };
export { deriveTargetGrowthPct } from "./allocation";
