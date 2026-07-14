import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";

/**
 * Tax-advantaged headroom v1: structural checks per adult member against the
 * TaxRegistry ceilings (existence of hishtalmut / pension vehicles).
 * Contribution-level headroom needs salary data — arrives with richer cash-flow mapping.
 */
export function analyzeTaxHeadroom(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const hishtalmut = ctx.taxRules["HISHTALMUT_CEILINGS"] as
    | { selfEmployedExemptDepositAnnualILS: number }
    | undefined;

  const adults = snapshot.members.filter((m) => m.role === "ADULT");
  const accountsByOwner = (memberId: string, types: string[]) =>
    snapshot.items.filter(
      (i) => i.kind === "ACCOUNT" && types.includes(i.accountType ?? "") && i.ownerMemberIds.includes(memberId),
    );

  for (const adult of adults) {
    if (accountsByOwner(adult.id, ["KEREN_HISHTALMUT"]).length === 0) {
      findings.push({
        code: "TAX_HISHTALMUT_MISSING",
        severity: "NOTICE",
        metrics: {
          memberName: adult.name,
          exemptCeilingAnnualILS: hishtalmut?.selfEmployedExemptDepositAnnualILS ?? 0,
        },
        evidenceItemIds: [],
      });
    }
    if (
      accountsByOwner(adult.id, ["PENSION_COMPREHENSIVE", "PENSION_GENERAL", "IRA_GEMEL", "FOREIGN_RETIREMENT"]).length === 0 &&
      adult.employmentStatus !== "RETIRED"
    ) {
      findings.push({
        code: "TAX_PENSION_MISSING",
        severity: "WARNING",
        metrics: { memberName: adult.name },
        evidenceItemIds: [],
      });
    }
  }

  // Fee drag: management fee above the per-product-type notice threshold (falls back to the global one).
  const feeMax = Number(ctx.assumptions["management_fee_notice_pct"] ?? 0.8);
  const feeByType = (ctx.assumptions["management_fee_notice_by_type"] as Record<string, number> | undefined) ?? {};
  for (const item of snapshot.items) {
    if (item.kind === "ACCOUNT" && item.managementFeePct !== null) {
      const threshold = feeByType[item.accountType ?? ""] ?? feeMax;
      if (item.managementFeePct > threshold) {
        findings.push({
          code: "HIGH_MANAGEMENT_FEE",
          severity: "NOTICE",
          metrics: { itemName: item.name, feePct: item.managementFeePct, noticePct: threshold },
          evidenceItemIds: [item.id],
        });
      }
    }
  }
  return findings;
}
