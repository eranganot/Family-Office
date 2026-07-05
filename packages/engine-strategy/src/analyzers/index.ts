import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";
import { analyzeConcentration } from "./concentration";
import { analyzeCurrency } from "./currency";
import { analyzeDebt } from "./debt";
import { analyzeLiquidity } from "./liquidity";
import { analyzeTaxHeadroom } from "./tax-headroom";

export const ANALYZERS = [
  analyzeLiquidity,
  analyzeConcentration,
  analyzeCurrency,
  analyzeTaxHeadroom,
  analyzeDebt,
] as const;

export function runAnalyzers(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  return ANALYZERS.flatMap((a) => a(snapshot, ctx));
}

export { analyzeConcentration, analyzeCurrency, analyzeDebt, analyzeLiquidity, analyzeTaxHeadroom };
