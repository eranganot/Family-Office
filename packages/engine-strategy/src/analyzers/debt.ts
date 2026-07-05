import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";

export function analyzeDebt(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const cpiMax = Number(ctx.assumptions["mortgage_cpi_linked_max_pct"] ?? 60);
  const expensiveRate = Number(ctx.assumptions["expensive_debt_rate_pct"] ?? 8);

  for (const item of snapshot.items) {
    if (item.mortgageTracks && item.mortgageTracks.length > 0) {
      const total = item.mortgageTracks.reduce((s, t) => s + t.principalRemaining, 0);
      if (total > 0) {
        const cpiShare = (item.mortgageTracks.filter((t) => t.cpiLinked).reduce((s, t) => s + t.principalRemaining, 0) / total) * 100;
        if (cpiShare > cpiMax) {
          findings.push({
            code: "MORTGAGE_CPI_CONCENTRATION",
            severity: "NOTICE",
            metrics: { itemName: item.name, cpiSharePct: Math.round(cpiShare), thresholdPct: cpiMax },
            evidenceItemIds: [item.id],
          });
        }
        const maxRate = Math.max(...item.mortgageTracks.map((t) => t.annualRatePct));
        if (maxRate > expensiveRate) {
          findings.push({
            code: "MORTGAGE_EXPENSIVE_TRACK",
            severity: "NOTICE",
            metrics: { itemName: item.name, maxRatePct: maxRate, thresholdPct: expensiveRate },
            evidenceItemIds: [item.id],
          });
        }
      }
    }
    if (item.kind === "LOAN" && item.valueBase !== null && item.valueBase > 0) {
      // Loan rates live in detail; snapshot v1 carries only mortgage tracks — flag large loans for review.
      const largeLoan = Number(ctx.assumptions["large_loan_notice_base"] ?? 100_000);
      if (item.valueBase > largeLoan) {
        findings.push({
          code: "LARGE_NON_MORTGAGE_DEBT",
          severity: "NOTICE",
          metrics: { itemName: item.name, valueBase: Math.round(item.valueBase) },
          evidenceItemIds: [item.id],
        });
      }
    }
  }
  return findings;
}
