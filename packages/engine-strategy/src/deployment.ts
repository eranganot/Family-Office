import type { SnapshotPayload } from "@wealthos/domain";
import { deriveTargetGrowthPct } from "./analyzers/allocation";
import type { AnalyzerContext } from "./findings";
import { isCash, sum, valued } from "./analyzers/pools";
import { validateStrategyText } from "./validator";

/**
 * M25 — free-cash deployment waterfall (the ALLOCATION phase engine). Pure and
 * deterministic: given the verified snapshot and registry context, it answers
 * "where should every free shekel go, in what order, and why".
 *
 * Owner decisions (2026-07-15): deployable = CASH-type accounts beyond the
 * emergency buffer; debt repayment is math-driven (only tracks above
 * expensive_debt_rate_pct — a guaranteed return beating expected investing);
 * order: buffer → expensive debt → unused tax ceilings → allocation-gap investing.
 * Unknown expenses ⇒ REFUSAL to deploy (never guess the buffer).
 */

export type DeploymentStepKind =
  | "BUFFER_TOP_UP"
  | "REPAY_EXPENSIVE_DEBT"
  | "TAX_CEILING_HISHTALMUT"
  | "TAX_CEILING_PENSION"
  | "INVEST_GROWTH"
  | "INVEST_DEFENSIVE";

export interface DeploymentStep {
  kind: DeploymentStepKind;
  amountBase: number;
  detail: string;
  detailHe: string;
  evidenceItemIds: string[];
}

export type DeploymentNote =
  | "EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED"
  | "BUFFER_BELOW_TARGET"
  | "MIX_UNKNOWN_INVEST_UNSPLIT"
  | "NO_FREE_CASH";

export interface DeploymentPlan {
  engineNote: "STRATEGY_LEVEL_ONLY_NEVER_PRODUCTS";
  monthlyExpensesBase: number | null;
  bufferTargetBase: number | null;
  cashBase: number;
  freeCashBase: number;
  steps: DeploymentStep[];
  leftoverBase: number;
  notes: DeploymentNote[];
}

interface HishtalmutCeilings { selfEmployedExemptDepositAnnualILS: number }
interface PensionCeilings { qualifiedIncomeAnnualILS: number; maxBenefitDepositPctOfQualified: number }

const round = (n: number) => Math.round(n);

function annualizeDeposit(amount: number, frequency: string): number {
  if (frequency === "MONTHLY") return amount * 12;
  return amount;
}

export function computeDeploymentPlan(snapshot: SnapshotPayload, ctx: AnalyzerContext): DeploymentPlan {
  const notes: DeploymentNote[] = [];
  const steps: DeploymentStep[] = [];

  // --- household expense base (same policy as the liquidity analyzer) ---------
  const monthlyExpenses = snapshot.items
    .filter((i) => i.cashFlow?.direction === "OUT" && i.cashFlow.amountBase !== null)
    .reduce((s, i) => {
      const amount = i.cashFlow!.amountBase!;
      return s + (i.cashFlow!.frequency === "ANNUAL" ? amount / 12 : i.cashFlow!.frequency === "MONTHLY" ? amount : 0);
    }, 0);

  const cashItems = valued(snapshot.items).filter(isCash);
  const cashBase = sum(cashItems);
  const cashIds = cashItems.map((i) => i.id);

  if (monthlyExpenses <= 0) {
    // Never guess the buffer: without a mapped expense base there is no safe "free" cash.
    return {
      engineNote: "STRATEGY_LEVEL_ONLY_NEVER_PRODUCTS",
      monthlyExpensesBase: null,
      bufferTargetBase: null,
      cashBase: round(cashBase),
      freeCashBase: 0,
      steps: [],
      leftoverBase: 0,
      notes: ["EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED"],
    };
  }

  const targetMonths = Number(ctx.assumptions["emergency_fund_months"] ?? 6);
  const bufferTarget = monthlyExpenses * targetMonths;

  if (cashBase < bufferTarget) {
    const shortfall = bufferTarget - cashBase;
    steps.push({
      kind: "BUFFER_TOP_UP",
      amountBase: round(shortfall),
      detail: `Cash covers less than the ${targetMonths}-month buffer — direct new savings to close the ${round(shortfall)} shortfall before deploying anything.`,
      detailHe: `המזומן מכסה פחות מכרית של ${targetMonths} חודשים — נתבו חיסכון חדש לסגירת פער של ${round(shortfall)} לפני כל פריסה אחרת.`,
      evidenceItemIds: cashIds,
    });
    notes.push("BUFFER_BELOW_TARGET");
    return {
      engineNote: "STRATEGY_LEVEL_ONLY_NEVER_PRODUCTS",
      monthlyExpensesBase: round(monthlyExpenses),
      bufferTargetBase: round(bufferTarget),
      cashBase: round(cashBase),
      freeCashBase: 0,
      steps,
      leftoverBase: 0,
      notes,
    };
  }

  let remaining = cashBase - bufferTarget;
  const freeCash = remaining;
  if (freeCash <= 0) notes.push("NO_FREE_CASH");

  // --- 1. math-driven expensive-debt repayment --------------------------------
  const expensiveRate = Number(ctx.assumptions["expensive_debt_rate_pct"] ?? 8);
  const debts: Array<{ id: string; name: string; ratePct: number; principal: number }> = [];
  for (const it of snapshot.items) {
    if (it.kind === "MORTGAGE" && it.mortgageTracks) {
      for (const t of it.mortgageTracks) {
        if (t.annualRatePct > expensiveRate && t.principalRemaining > 0) {
          debts.push({ id: it.id, name: `${it.name} · ${t.trackType}`, ratePct: t.annualRatePct, principal: t.principalRemaining });
        }
      }
    }
  }
  debts.sort((a, b) => b.ratePct - a.ratePct);
  for (const d of debts) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, d.principal);
    steps.push({
      kind: "REPAY_EXPENSIVE_DEBT",
      amountBase: round(amount),
      detail: `Repay ${round(amount)} of "${d.name}" (${d.ratePct}%) — a guaranteed return above the expected investment return. Get the early-repayment fee quote first.`,
      detailHe: `פרעו ${round(amount)} מ"${d.name}" (${d.ratePct}%) — תשואה מובטחת מעל התשואה הצפויה מהשקעה. בקשו קודם דוח עמלת פירעון מוקדם.`,
      evidenceItemIds: [d.id],
    });
    remaining -= amount;
  }

  // --- 2. unused tax ceilings (this tax year, per member) ---------------------
  if (snapshot.baseCurrency === "ILS" && remaining > 0) {
    const hish = ctx.taxRules["HISHTALMUT_CEILINGS"] as HishtalmutCeilings | undefined;
    const pens = ctx.taxRules["PENSION_CEILINGS"] as PensionCeilings | undefined;
    const hishCeiling = hish?.selfEmployedExemptDepositAnnualILS ?? 0;
    const pensCeiling = pens ? (pens.qualifiedIncomeAnnualILS * pens.maxBenefitDepositPctOfQualified) / 100 : 0;

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

    for (const adult of snapshot.members.filter((m) => m.role === "ADULT")) {
      if (remaining <= 0) break;
      const hishUnused = hishCeiling - depositsFor(adult.id, "HISHTALMUT_CONTRIBUTION");
      if (hishCeiling > 0 && hishUnused > 0) {
        const amount = Math.min(remaining, hishUnused);
        steps.push({
          kind: "TAX_CEILING_HISHTALMUT",
          amountBase: round(amount),
          detail: `Deposit ${round(amount)} to ${adult.name}'s keren hishtalmut — inside this year's exempt ceiling, growth is capital-gains free.`,
          detailHe: `הפקידו ${round(amount)} לקרן ההשתלמות של ${adult.name} — בתוך התקרה הפטורה השנה, הצבירה פטורה ממס רווחי הון.`,
          evidenceItemIds: [],
        });
        remaining -= amount;
      }
      if (remaining <= 0) break;
      const pensUnused = pensCeiling - depositsFor(adult.id, "PENSION_CONTRIBUTION");
      if (pensCeiling > 0 && pensUnused > 0) {
        const amount = Math.min(remaining, pensUnused);
        steps.push({
          kind: "TAX_CEILING_PENSION",
          amountBase: round(amount),
          detail: `Deposit ${round(amount)} to ${adult.name}'s pension within the benefit ceiling — immediate deduction/credit value.`,
          detailHe: `הפקידו ${round(amount)} לפנסיה של ${adult.name} בתוך תקרת ההטבה — שווי ניכוי/זיכוי מיידי.`,
          evidenceItemIds: [],
        });
        remaining -= amount;
      }
    }
  }

  // --- 3. invest the rest toward the risk-derived target mix ------------------
  if (remaining > 0) {
    const targetGrowthPct = deriveTargetGrowthPct(ctx.assumptions);
    const unknownMaxPct = Number(ctx.assumptions["allocation_mix_unknown_max_pct"] ?? 50);

    const investable = valued(snapshot.items).filter((i) => i.kind === "ACCOUNT");
    let growth = 0;
    let known = 0;
    let unknown = 0;
    for (const i of investable) {
      const v = i.valueBase ?? 0;
      if (i.growthSharePct !== null && i.growthSharePct !== undefined) {
        growth += (v * i.growthSharePct) / 100;
        known += v;
      } else if (isCash(i)) {
        known += v; // defensive
      } else {
        unknown += v;
      }
    }
    const unknownSharePct = known + unknown > 0 ? (unknown / (known + unknown)) * 100 : 0;

    if (unknownSharePct > unknownMaxPct) {
      steps.push({
        kind: "INVEST_GROWTH",
        amountBase: round(remaining),
        detail: `Invest the remaining ${round(remaining)} — but first record the growth share of your accounts (too much of the portfolio is unknown to split growth/defensive responsibly).`,
        detailHe: `השקיעו את היתרה ${round(remaining)} — אך קודם הזינו רכיב צמיחה לחשבונות (חלק גדול מדי מהתיק אינו ידוע כדי לפצל צמיחה/סולידי באחריות).`,
        evidenceItemIds: [],
      });
      notes.push("MIX_UNKNOWN_INVEST_UNSPLIT");
      remaining = 0;
    } else {
      const totalAfter = known + remaining;
      const desiredGrowth = (targetGrowthPct / 100) * totalAfter;
      const growthAmount = Math.min(remaining, Math.max(0, desiredGrowth - growth));
      const defensiveAmount = remaining - growthAmount;
      if (growthAmount > 0.5) {
        steps.push({
          kind: "INVEST_GROWTH",
          amountBase: round(growthAmount),
          detail: `Invest ${round(growthAmount)} in growth channels (equity-type tracks in existing wrappers or a taxable investment account) — moves the mix toward your ${targetGrowthPct}% target.`,
          detailHe: `השקיעו ${round(growthAmount)} באפיקי צמיחה (מסלולים מוטי-צמיחה בעטיפות הקיימות או חשבון השקעות חייב) — מקרב את התמהיל ליעד ${targetGrowthPct}%.`,
          evidenceItemIds: [],
        });
        remaining -= growthAmount;
      }
      if (defensiveAmount > 0.5) {
        steps.push({
          kind: "INVEST_DEFENSIVE",
          amountBase: round(defensiveAmount),
          detail: `Place ${round(defensiveAmount)} in defensive channels (bond-oriented tracks / deposits) to keep the mix at target.`,
          detailHe: `הניחו ${round(defensiveAmount)} באפיקים סולידיים (מסלולים מוטי-אג"ח / פיקדונות) לשמירת התמהיל ביעד.`,
          evidenceItemIds: [],
        });
        remaining -= defensiveAmount;
      }
    }
  }

  // Guard: every human-readable string stays strategy-level.
  const texts = steps.flatMap((s) => [s.detail, s.detailHe]);
  const validation = validateStrategyText(texts);
  if (!validation.valid) throw new Error(`PRODUCT_REFERENCE_IN_DEPLOYMENT:${validation.pattern}`);

  return {
    engineNote: "STRATEGY_LEVEL_ONLY_NEVER_PRODUCTS",
    monthlyExpensesBase: round(monthlyExpenses),
    bufferTargetBase: round(bufferTarget),
    cashBase: round(cashBase),
    freeCashBase: round(freeCash),
    steps,
    leftoverBase: round(Math.max(0, remaining)),
    notes,
  };
}
