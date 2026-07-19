import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";

export function analyzeDebt(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const cpiMax = Number(ctx.assumptions["mortgage_cpi_linked_max_pct"] ?? 60);
  const expensiveRate = Number(ctx.assumptions["expensive_debt_rate_pct"] ?? 8);
  const boiRate = ctx.marketRates?.boiRatePct ?? null;
  const VARIABLE_TRACKS = new Set(["PRIME", "VARIABLE_LINKED", "VARIABLE_UNLINKED"]);

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
        const repaidByPlan = ctx.committedPlan?.repaidTrackItemIds.includes(item.id) ?? false;
        const maxRate = Math.max(...item.mortgageTracks.map((t) => t.annualRatePct));
        if (maxRate > expensiveRate && !repaidByPlan) {
          findings.push({
            code: "MORTGAGE_EXPENSIVE_TRACK",
            severity: "NOTICE",
            metrics: { itemName: item.name, maxRatePct: maxRate, thresholdPct: expensiveRate },
            evidenceItemIds: [item.id],
          });
        }

        // Refinance signal (B6): a variable/prime track priced above the live BOI-derived prime benchmark.
        if (boiRate !== null) {
          const primeSpread = Number(ctx.assumptions["mortgage_prime_spread_pct"] ?? 1.5);
          const refiNotice = Number(ctx.assumptions["mortgage_refinance_notice_spread_pct"] ?? 0.5);
          const benchmark = boiRate + primeSpread;
          const worst = item.mortgageTracks
            .filter((t) => VARIABLE_TRACKS.has(t.trackType))
            .reduce<{ trackType: string; annualRatePct: number } | null>(
              (a, t) => (a === null || t.annualRatePct > a.annualRatePct ? t : a),
              null,
            );
          if (worst && worst.annualRatePct > benchmark + refiNotice && !repaidByPlan) {
            findings.push({
              code: "MORTGAGE_ABOVE_BENCHMARK",
              severity: "NOTICE",
              metrics: {
                itemName: item.name,
                trackType: worst.trackType,
                trackRatePct: worst.annualRatePct,
                benchmarkPct: Math.round(benchmark * 100) / 100,
                boiRatePct: boiRate,
                excessPct: Math.round((worst.annualRatePct - benchmark) * 100) / 100,
              },
              evidenceItemIds: [item.id],
            });
          }
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
