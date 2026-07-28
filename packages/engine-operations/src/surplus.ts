import type { BehavioralClassKey } from "@wealthos/domain";
import type {
  BehavioralTotals,
  CategoryTotal,
  MonthlyCashFlow,
  MonthlyCashFlowResult,
  Refusal,
  VerifiedSurplus,
  VerifiedSurplusResult,
} from "./types";
import { OPERATIONS_ENGINE_VERSION } from "./version";

/** One transaction as the engine sees it. Deliberately minimal — no Prisma types here. */
export interface TxnView {
  id: string;
  bookedAt: Date;
  /** Signed, in BASE currency. `null` when no FxRate existed — never guessed. */
  amountBase: number | null;
  currency: string;
  status: "PENDING" | "BOOKED" | "VOID";
  categoryId: string | null;
  categoryKey: string | null;
  categoryAxis: "INCOME" | "EXPENSE" | null;
  behavioral: BehavioralClassKey | null;
  /** True when the active classification is unconfirmed (Suspense). */
  unverified: boolean;
  instalmentNumber?: number | null | undefined;
  instalmentTotal?: number | null | undefined;
}

export interface PeriodInput {
  year: number;
  month: number;
  transactions: TxnView[];
  /** Scheduled debt service from the LEDGER (mortgage tracks + loans), monthly, base ccy. */
  debtServiceBase: number;
  /** True when a known source (e.g. the US account) has not been imported for this month. */
  hasKnownMissingSource: boolean;
  /** Any bank-side card settlement that could NOT be reconciled to a card statement. */
  hasUnreconciledSettlement: boolean;
}

const ZERO_BEHAVIORAL = (): BehavioralTotals => ({
  FIXED_CONTRACTUAL: 0,
  VARIABLE_DISCRETIONARY: 0,
  FINANCIAL_DRAG: 0,
  SAVINGS_FLOW: 0,
  TRANSFER: 0,
});

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Compute one household-month along both axes.
 *
 * Rules that matter, all of them load-bearing:
 *  - PENDING and VOID transactions are excluded. A CAL "בתהליך קליטה" row has not
 *    settled, so counting it would overstate the month.
 *  - TRANSFER is excluded from BOTH income and expense. This is what stops a bank-side
 *    card settlement from double-counting the itemised card statement.
 *  - SAVINGS_FLOW is excluded from expenses (owner decision D7) and reported separately
 *    as capital already deployed.
 *  - A transaction with `amountBase === null` (no FX rate) does not silently become
 *    zero — it makes the whole period REFUSE, because a partial total is a wrong total.
 */
export function computeMonthlyCashFlow(input: PeriodInput): MonthlyCashFlowResult {
  const counted = input.transactions.filter((t) => t.status === "BOOKED");
  // Reported, never counted: a pending charge has not settled, so including it would
  // break reconciliation against the bank — but hiding it entirely is what made the
  // owner ask why three transactions had vanished.
  const pendingRows = input.transactions.filter((t) => t.status === "PENDING");
  const pendingAmountBase =
    Math.round(pendingRows.reduce((n, t) => n + Math.abs(t.amountBase ?? 0), 0) * 100) / 100;

  const missingFx = counted.filter((t) => t.amountBase === null);
  if (missingFx.length > 0) {
    return {
      ok: false,
      reason: "MISSING_FX_RATE",
      detail: {
        count: missingFx.length,
        currencies: [...new Set(missingFx.map((t) => t.currency))].join(","),
      },
    } satisfies Refusal;
  }

  const byCategoryMap = new Map<string, CategoryTotal>();
  const byBehavioral = ZERO_BEHAVIORAL();

  let incomeBase = 0;
  let expensesBase = 0;
  let savingsFlowsBase = 0;
  let leakageBase = 0;
  let transfersExcludedBase = 0;
  let unverifiedCount = 0;
  let unverifiedAmountBase = 0;

  const addCategory = (t: TxnView, abs: number): void => {
    if (!t.categoryId) return;
    const prev = byCategoryMap.get(t.categoryId);
    byCategoryMap.set(t.categoryId, {
      categoryId: t.categoryId,
      categoryKey: t.categoryKey ?? "",
      amountBase: round2((prev?.amountBase ?? 0) + abs),
    });
  };

  for (const t of counted) {
    const amt = t.amountBase ?? 0;
    const behavioral = t.behavioral ?? "VARIABLE_DISCRETIONARY";
    const abs = Math.abs(amt);

    if (t.unverified) {
      unverifiedCount += 1;
      unverifiedAmountBase += abs;
    }

    if (behavioral === "TRANSFER") {
      byBehavioral.TRANSFER += abs;
      transfersExcludedBase += abs;
      continue; // excluded from BOTH sides, by design
    }

    // Direction comes from the SIGN, not from the category axis: the sign is observed
    // fact, whereas the axis is a classification that may still be unconfirmed.
    if (amt > 0) {
      incomeBase += amt;
      addCategory(t, abs);
      continue;
    }

    // --- outflow ---
    // The behavioural axis describes SPENDING only. Income is never "fixed" or
    // "discretionary" in this sense, and folding it in here would inflate the fixed
    // bucket and drive Safe-to-Spend negative.
    byBehavioral[behavioral] += abs;
    addCategory(t, abs);

    if (behavioral === "SAVINGS_FLOW") {
      savingsFlowsBase += abs;
      continue; // capital deployed, not consumption (owner decision D7)
    }

    expensesBase += abs;
    if (behavioral === "FINANCIAL_DRAG") leakageBase += abs;
  }

  if (incomeBase === 0 && expensesBase === 0) {
    return { ok: false, reason: "NO_EXPENSES_MAPPED", detail: { transactions: counted.length } };
  }

  const coverage: MonthlyCashFlow["coverage"] = input.hasUnreconciledSettlement
    ? "AGGREGATE_ONLY"
    : input.hasKnownMissingSource
      ? "PARTIAL"
      : "COMPLETE";

  return {
    ok: true,
    year: input.year,
    month: input.month,
    incomeBase: round2(incomeBase),
    expensesBase: round2(expensesBase),
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.amountBase - a.amountBase),
    byBehavioral: {
      FIXED_CONTRACTUAL: round2(byBehavioral.FIXED_CONTRACTUAL),
      VARIABLE_DISCRETIONARY: round2(byBehavioral.VARIABLE_DISCRETIONARY),
      FINANCIAL_DRAG: round2(byBehavioral.FINANCIAL_DRAG),
      SAVINGS_FLOW: round2(byBehavioral.SAVINGS_FLOW),
      TRANSFER: round2(byBehavioral.TRANSFER),
    },
    savingsFlowsBase: round2(savingsFlowsBase),
    leakageBase: round2(leakageBase),
    transfersExcludedBase: round2(transfersExcludedBase),
    unverifiedCount,
    unverifiedAmountBase: round2(unverifiedAmountBase),
    pendingCount: pendingRows.length,
    pendingAmountBase,
    coverage,
  };
}

/**
 * Verified monthly surplus (owner decision D7 — net-of-payroll).
 *
 *   surplus = netIncome - expenses - debtService
 *
 * `expenses` already excludes SAVINGS_FLOW and TRANSFER by construction above, so
 * pension/hishtalmut contributions do NOT reduce surplus — they show up as capital
 * already deployed. Debt service comes from the LEDGER (mortgage tracks + loans),
 * not from transactions, because the ledger is the canonical, verified source.
 *
 * `provisional` is true whenever the month still contains unconfirmed classifications.
 * The figure is still produced — that is the non-blocking rule — but every consumer,
 * including the deployment engine, carries the flag.
 */
export function computeVerifiedSurplus(
  flow: MonthlyCashFlowResult,
  periodId: string,
  debtServiceBase: number,
): VerifiedSurplusResult {
  if (!flow.ok) return flow;
  if (flow.incomeBase === 0) {
    return { ok: false, reason: "NO_INCOME_MAPPED", detail: { month: flow.month, year: flow.year } };
  }
  const monthlyBase = round2(flow.incomeBase - flow.expensesBase - debtServiceBase);
  return {
    ok: true,
    monthlyBase,
    periodId,
    year: flow.year,
    month: flow.month,
    provisional: flow.unverifiedCount > 0 || flow.coverage !== "COMPLETE",
    engineVersion: OPERATIONS_ENGINE_VERSION,
  } satisfies VerifiedSurplus;
}

export interface SafeToSpendInput {
  flow: MonthlyCashFlow;
  debtServiceBase: number;
  /** Sum of cash-impacting CalendarEvents falling inside the window (incl. instalments). */
  committedInWindowBase: number;
  /** Monthly contribution still required to reach the emergency-fund target. */
  requiredBufferTopUpBase: number;
  windowDays: number;
}

export interface DiscretionaryLiquidityFloor {
  ok: true;
  safeToSpendBase: number;
  netIncomeBase: number;
  fixedBase: number;
  debtServiceBase: number;
  committedInWindowBase: number;
  bufferContributionBase: number;
  pendingCommittedBase: number;
  windowDays: number;
  provisional: boolean;
}

/**
 * The Discretionary Liquidity Floor ("Safe-to-Spend").
 *
 * What is left after everything the household has ALREADY committed to:
 *   safeToSpend = netIncome - fixed/contractual - debtService - calendar commitments
 *                 - required buffer top-up
 *
 * Note it subtracts FIXED_CONTRACTUAL but not VARIABLE_DISCRETIONARY — discretionary
 * spend is precisely what this number is a budget for, so subtracting it would be
 * circular. This is a ceiling on choice, not a prediction of behaviour, and it is
 * never framed to the household as a limit they have broken.
 */
export function computeSafeToSpend(
  input: SafeToSpendInput,
): DiscretionaryLiquidityFloor | Refusal {
  const { flow } = input;
  if (flow.incomeBase === 0) {
    return { ok: false, reason: "NO_INCOME_MAPPED" };
  }
  if (flow.byBehavioral.FIXED_CONTRACTUAL === 0 && flow.expensesBase === 0) {
    return { ok: false, reason: "NO_EXPENSES_MAPPED" };
  }
  // Pending card charges are already committed: the issuer will bill them. They are not
  // in `expensesBase` (they have not settled), so they must be subtracted here or
  // Safe-to-Spend overstates what is genuinely free.
  const safe = round2(
    flow.incomeBase -
      flow.byBehavioral.FIXED_CONTRACTUAL -
      input.debtServiceBase -
      input.committedInWindowBase -
      input.requiredBufferTopUpBase -
      flow.pendingAmountBase,
  );
  return {
    ok: true,
    safeToSpendBase: safe,
    netIncomeBase: flow.incomeBase,
    fixedBase: flow.byBehavioral.FIXED_CONTRACTUAL,
    debtServiceBase: input.debtServiceBase,
    committedInWindowBase: input.committedInWindowBase,
    bufferContributionBase: input.requiredBufferTopUpBase,
    pendingCommittedBase: flow.pendingAmountBase,
    windowDays: input.windowDays,
    provisional: flow.unverifiedCount > 0 || flow.coverage !== "COMPLETE",
  };
}

/**
 * Working capital: liquid balances minus what is committed in the next 30 days.
 * Distinct from the emergency fund — this is the month-to-month operating cushion,
 * sized by `working_capital_months` rather than `emergency_fund_months`.
 */
export function computeWorkingCapital(
  liquidBalancesBase: number,
  committedNext30Base: number,
  monthlyExpensesBase: number,
  workingCapitalMonths: number,
): { availableBase: number; targetBase: number; gapBase: number } {
  const availableBase = round2(liquidBalancesBase - committedNext30Base);
  const targetBase = round2(monthlyExpensesBase * workingCapitalMonths);
  return { availableBase, targetBase, gapBase: round2(Math.max(0, targetBase - availableBase)) };
}
