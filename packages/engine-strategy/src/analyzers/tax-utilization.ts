import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";

/**
 * Tax-year utilization tracker (B3). Pure, strategy-level. Compares each adult
 * member's mapped annual contributions to the registry ceilings and flags unused
 * headroom while months remain in the tax year. Deposits are read from mapped
 * contribution cash flows — never inferred from salary (engines never guess), so
 * a member with no contribution flows is simply not assessed here.
 *
 * v1: ceilings are ILS-denominated, so utilization is only computed when the base
 * currency is ILS. The Israeli tax year is the calendar year.
 */

interface HishtalmutCeilings { selfEmployedExemptDepositAnnualILS: number }
interface PensionCeilings { qualifiedIncomeAnnualILS: number; maxBenefitDepositPctOfQualified: number }

function annualizeDeposit(amount: number, frequency: string): number {
  if (frequency === "MONTHLY") return amount * 12;
  return amount; // ANNUAL or ONE_TIME count as the mapped amount for the year
}

export function analyzeTaxUtilization(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  if (snapshot.baseCurrency !== "ILS") return [];
  const findings: Finding[] = [];

  const hish = ctx.taxRules["HISHTALMUT_CEILINGS"] as HishtalmutCeilings | undefined;
  const pens = ctx.taxRules["PENSION_CEILINGS"] as PensionCeilings | undefined;
  const hishCeiling = hish?.selfEmployedExemptDepositAnnualILS ?? 0;
  const pensCeiling = pens ? (pens.qualifiedIncomeAnnualILS * pens.maxBenefitDepositPctOfQualified) / 100 : 0;

  const month = new Date(snapshot.takenAt).getUTCMonth(); // 0-11
  const monthsRemaining = 12 - month; // includes the current month

  const adults = snapshot.members.filter((m) => m.role === "ADULT");

  const depositsFor = (memberId: string, flowType: string): number => {
    let total = 0;
    for (const it of snapshot.items) {
      const cf = it.cashFlow;
      if (it.kind === "CASH_FLOW" && cf && cf.flowType === flowType && cf.amountBase !== null && it.ownerMemberIds.includes(memberId)) {
        total += annualizeDeposit(cf.amountBase, cf.frequency);
      }
    }
    return total;
  };

  const check = (
    memberName: string,
    deposited: number,
    ceiling: number,
    code: string,
  ): void => {
    if (ceiling <= 0 || deposited <= 0) return; // no ceiling data, or no mapped deposits → not assessed
    if (deposited >= ceiling) return; // fully utilized
    const utilizationPct = Math.round((deposited / ceiling) * 100);
    findings.push({
      code,
      severity: "NOTICE",
      metrics: {
        memberName,
        depositedBase: Math.round(deposited),
        ceilingBase: Math.round(ceiling),
        unusedBase: Math.round(ceiling - deposited),
        utilizationPct,
        monthsRemaining,
      },
      evidenceItemIds: [],
    });
  };

  for (const adult of adults) {
    if (!ctx.committedPlan?.taxDeposited) {
      check(adult.name, depositsFor(adult.id, "HISHTALMUT_CONTRIBUTION"), hishCeiling, "TAX_HISHTALMUT_UNDERUTILIZED");
      check(adult.name, depositsFor(adult.id, "PENSION_CONTRIBUTION"), pensCeiling, "TAX_PENSION_UNDERUTILIZED");
    }
  }

  return findings;
}
