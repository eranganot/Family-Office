import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";

/**
 * Insurance-gap analyzer (B2). Pure, strategy-level: reads mapped policies, income
 * and expense flows, members and mortgage principal from the snapshot and flags
 * protection gaps. Never names a product or insurer — only categories of cover.
 *
 * v1 simplifications (documented): survivor need is expressed against household
 * expenses (not per-earner income replacement); a policy with a null insuredMemberId
 * counts as household-level life cover; coverage compared in base currency.
 */

const EXPENSE_FLOWS = new Set(["LIVING_EXPENSE", "HOUSING_EXPENSE", "EDUCATION_EXPENSE", "OTHER_EXPENSE"]);
const INCOME_FLOWS = new Set(["SALARY", "SELF_EMPLOYMENT_INCOME"]);

function annualize(amount: number, frequency: string): number {
  if (frequency === "MONTHLY") return amount * 12;
  if (frequency === "ANNUAL") return amount;
  return 0; // ONE_TIME is not a recurring survivor need
}

export function analyzeInsurance(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const survivorMonths = Number(ctx.assumptions["insurance_survivor_expense_months"] ?? 60);

  // Annual household expenses from mapped OUT flows.
  let annualExpenses = 0;
  for (const it of snapshot.items) {
    const cf = it.cashFlow;
    if (it.kind === "CASH_FLOW" && cf && cf.direction === "OUT" && EXPENSE_FLOWS.has(cf.flowType) && cf.amountBase !== null) {
      annualExpenses += annualize(cf.amountBase, cf.frequency);
    }
  }
  const monthlyExpenses = annualExpenses / 12;

  // Earners: adults who own a positive income flow and are not retired.
  const earnerIds = new Set<string>();
  for (const it of snapshot.items) {
    const cf = it.cashFlow;
    if (it.kind === "CASH_FLOW" && cf && cf.direction === "IN" && INCOME_FLOWS.has(cf.flowType) && (cf.amountBase ?? 0) > 0) {
      for (const mid of it.ownerMemberIds) earnerIds.add(mid);
    }
  }
  const adults = new Map(snapshot.members.filter((m) => m.role === "ADULT").map((m) => [m.id, m] as const));

  const policies = snapshot.items.filter((i) => i.kind === "INSURANCE" && i.insurance);
  const lifePoliciesFor = (memberId: string) =>
    policies.filter(
      (p) => p.insurance!.policyType === "LIFE" && (p.insurance!.insuredMemberId === memberId || p.insurance!.insuredMemberId === null),
    );
  const lifeCoverFor = (memberId: string) =>
    lifePoliciesFor(memberId).reduce((s, p) => s + (p.insurance!.coverageAmountBase ?? 0), 0);
  const hasDisability = (memberId: string) =>
    policies.some((p) => p.insurance!.policyType === "DISABILITY" && p.insurance!.insuredMemberId === memberId);
  // Israeli comprehensive pension funds (קרן פנסיה מקיפה) EMBED disability (א.כ.ע) cover —
  // a member with one mapped needs no standalone policy recommendation (owner decision, 2026-07-14).
  const hasComprehensivePension = (memberId: string) =>
    snapshot.items.some(
      (i) => i.kind === "ACCOUNT" && i.accountType === "PENSION_COMPREHENSIVE" && i.ownerMemberIds.includes(memberId),
    );

  for (const memberId of earnerIds) {
    const member = adults.get(memberId);
    if (!member || member.employmentStatus === "RETIRED") continue;

    // (a) survivor income protection — only assessable when expenses are known.
    if (annualExpenses > 0) {
      const required = monthlyExpenses * survivorMonths;
      const cover = lifeCoverFor(memberId);
      if (cover < required) {
        findings.push({
          code: "INSURANCE_SURVIVOR_GAP",
          severity: "WARNING",
          metrics: {
            memberName: member.name,
            coverageBase: Math.round(cover),
            requiredBase: Math.round(required),
            months: survivorMonths,
            monthlyExpensesBase: Math.round(monthlyExpenses),
          },
          evidenceItemIds: lifePoliciesFor(memberId).map((p) => p.id),
        });
      }
    }

    // (b) disability cover for an active earner — comprehensive pension counts as covered.
    if (!hasDisability(memberId) && !hasComprehensivePension(memberId)) {
      findings.push({
        code: "INSURANCE_DISABILITY_MISSING",
        severity: "WARNING",
        metrics: { memberName: member.name },
        evidenceItemIds: [],
      });
    }
  }

  // (c) mortgage-life vs outstanding principal.
  let outstanding = 0;
  for (const it of snapshot.items) {
    if (it.kind === "MORTGAGE" && it.mortgageTracks) {
      outstanding += it.mortgageTracks.reduce((s, t) => s + t.principalRemaining, 0);
    }
  }
  if (outstanding > 0) {
    const mortgageLifeCover = policies
      .filter((p) => p.insurance!.policyType === "MORTGAGE_LIFE")
      .reduce((s, p) => s + (p.insurance!.coverageAmountBase ?? 0), 0);
    if (mortgageLifeCover < outstanding) {
      findings.push({
        code: "INSURANCE_MORTGAGE_LIFE_GAP",
        severity: "WARNING",
        metrics: {
          outstandingBase: Math.round(outstanding),
          coverageBase: Math.round(mortgageLifeCover),
          shortfallBase: Math.round(outstanding - mortgageLifeCover),
        },
        evidenceItemIds: snapshot.items.filter((i) => i.kind === "MORTGAGE").map((i) => i.id),
      });
    }
  }

  return findings;
}
