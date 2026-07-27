import type { PrismaClient } from "@wealthos/db";
import { assumptionRegistry } from "@wealthos/registry";
import {
  classify,
  committedInstalmentsInWindow,
  computeMonthlyCashFlow,
  computeSafeToSpend,
  computeVerifiedSurplus,
  computeWorkingCapital,
  OPERATIONS_ENGINE_VERSION,
  projectRemainingInstalments,
  reconcileWithSign,
  type DiscretionaryLiquidityFloor,
  type MonthlyCashFlowResult,
  type Refusal,
  type TxnView,
  type VerifiedSurplusResult,
} from "@wealthos/engine-operations";
import type { BehavioralClassKey } from "@wealthos/domain";

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** Pull the operations assumptions once; every threshold lives in the registry. */
export async function operationsAssumptions(db: PrismaClient, householdId: string) {
  const reg = assumptionRegistry(db);
  const rows = await reg.all(householdId);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const n = (k: string, fallback: number): number => {
    const v = map[k];
    return typeof v === "number" ? v : fallback;
  };
  return {
    minConfidence: n("operations_classification_min_confidence", 0.85),
    minActiveDays: n("operations_normalisation_min_days", 20),
    baselineMonths: n("operations_baseline_months", 3),
    workingCapitalMonths: n("working_capital_months", 1.5),
    safeToSpendWindowDays: n("safe_to_spend_window_days", 30),
    emergencyFundMonths: n("emergency_fund_months", 6),
    pins: rows
      .filter((r) => r.key.startsWith("operations_") || r.key === "working_capital_months" || r.key === "safe_to_spend_window_days")
      .map((r) => ({ key: r.key, version: r.version })),
  };
}

function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
  };
}

/**
 * Owner-confirmed merchant memory. Built from CONFIRMED classifications, newest first.
 * This is the entire learning mechanism — correct a merchant once and every future
 * transaction from it follows, with no model involved (owner decision D3).
 */
export async function buildOwnerMemory(
  db: PrismaClient,
  householdId: string,
): Promise<Map<string, { categoryKey: string; behavioral: BehavioralClassKey }>> {
  const rows = await db.transactionClassification.findMany({
    where: { status: "CONFIRMED", transaction: { householdId } },
    orderBy: { createdAt: "desc" },
    select: {
      behavioralClass: true,
      category: { select: { key: true } },
      transaction: { select: { merchantKey: true } },
    },
    take: 2000,
  });
  const memory = new Map<string, { categoryKey: string; behavioral: BehavioralClassKey }>();
  for (const r of rows) {
    const key = r.transaction.merchantKey;
    if (!key || memory.has(key)) continue; // newest decision wins
    memory.set(key, { categoryKey: r.category.key, behavioral: r.behavioralClass as BehavioralClassKey });
  }
  return memory;
}

/**
 * Classify every unclassified BOOKED transaction in the household.
 * Idempotent: already-confirmed rows are never touched.
 */
export async function autoClassify(
  db: PrismaClient,
  householdId: string,
): Promise<{ classified: number; suspense: number }> {
  const { minConfidence } = await operationsAssumptions(db, householdId);
  const ownerMemory = await buildOwnerMemory(db, householdId);

  const categories = await db.cashFlowCategory.findMany({
    where: { householdId },
    select: { id: true, key: true, axis: true },
  });
  const idByKey = new Map(categories.map((c) => [c.key, c.id]));
  const axisByKey = new Map(categories.map((c) => [c.key, c.axis]));
  const isIncomeCategory = (k: string): boolean => axisByKey.get(k) === "INCOME";

  const pending = await db.transaction.findMany({
    where: {
      householdId,
      classifications: { none: { status: "CONFIRMED" } },
    },
    select: { id: true, descriptionRedacted: true, merchantKey: true, amountBase: true, amount: true },
    take: 5000,
  });

  let classified = 0;
  let suspense = 0;
  for (const t of pending) {
    const raw = classify(
      { descriptionRedacted: t.descriptionRedacted, merchantKey: t.merchantKey ?? undefined },
      { minConfidence, ownerMemory },
    );
    const signed = num(t.amountBase ?? t.amount);
    const r = reconcileWithSign(raw, signed, isIncomeCategory, minConfidence);
    const categoryId = idByKey.get(r.categoryKey);
    if (!categoryId) continue; // category tree not seeded yet — skip rather than invent

    await db.$transaction(async (tx) => {
      await tx.transactionClassification.updateMany({
        where: { transactionId: t.id, status: { not: "SUPERSEDED" } },
        data: { status: "SUPERSEDED" },
      });
      await tx.transactionClassification.create({
        data: {
          transactionId: t.id,
          categoryId,
          behavioralClass: r.behavioral,
          confidence: r.confidence.toFixed(3),
          method: r.method,
          ruleVersion: r.ruleVersion,
          status: r.suspense ? "SUSPENSE" : "AUTO",
        },
      });
      await tx.transaction.update({
        where: { id: t.id },
        data: { categoryId, behavioralClass: r.behavioral },
      });
    });
    classified += 1;
    if (r.suspense) suspense += 1;
  }
  return { classified, suspense };
}

async function loadTxnViews(db: PrismaClient, householdId: string, year: number, month: number): Promise<TxnView[]> {
  const { start, end } = monthBounds(year, month);
  const rows = await db.transaction.findMany({
    where: { householdId, bookedAt: { gte: start, lte: end } },
    select: {
      id: true, bookedAt: true, amount: true, amountBase: true, currency: true, status: true,
      categoryId: true, behavioralClass: true, instalmentNumber: true, instalmentTotal: true,
      category: { select: { key: true, axis: true } },
      classifications: {
        where: { status: { not: "SUPERSEDED" } },
        select: { status: true },
        take: 1,
      },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    bookedAt: t.bookedAt,
    amountBase: t.amountBase === null ? null : Number(t.amountBase),
    currency: t.currency,
    status: t.status,
    categoryId: t.categoryId,
    categoryKey: t.category?.key ?? null,
    categoryAxis: t.category?.axis ?? null,
    behavioral: (t.behavioralClass as BehavioralClassKey | null),
    unverified: t.classifications[0]?.status === "SUSPENSE",
    instalmentNumber: t.instalmentNumber,
    instalmentTotal: t.instalmentTotal,
  }));
}

/**
 * Monthly debt service from the LEDGER — mortgage tracks and loans — not from
 * transactions. The ledger is the canonical, verified source; transactions are evidence.
 */
async function ledgerDebtService(db: PrismaClient, householdId: string): Promise<number> {
  const items = await db.ledgerItem.findMany({
    where: { householdId, status: "ACTIVE", kind: { in: ["MORTGAGE", "LOAN"] } },
    select: {
      cashFlowDetail: { select: { amount: true, frequency: true, direction: true } },
    },
  });
  let total = 0;
  for (const i of items) {
    const cf = i.cashFlowDetail;
    if (!cf || cf.direction !== "OUT") continue;
    const amt = num(cf.amount);
    total += cf.frequency === "ANNUAL" ? amt / 12 : cf.frequency === "MONTHLY" ? amt : 0;
  }
  return Math.round(total * 100) / 100;
}

export interface PeriodComputation {
  flow: MonthlyCashFlowResult;
  surplus: VerifiedSurplusResult;
  safeToSpend: DiscretionaryLiquidityFloor | Refusal;
  workingCapital: { availableBase: number; targetBase: number; gapBase: number };
  committedInstalmentsBase: number;
  engineVersion: string;
  pins: Array<{ key: string; version: number }>;
}

export async function computePeriod(
  db: PrismaClient,
  householdId: string,
  year: number,
  month: number,
): Promise<PeriodComputation> {
  const a = await operationsAssumptions(db, householdId);
  const txns = await loadTxnViews(db, householdId, year, month);
  const debtServiceBase = await ledgerDebtService(db, householdId);

  // Remaining instalments across ALL history are claims on FUTURE liquidity.
  const instalmentRows = await db.transaction.findMany({
    where: { householdId, instalmentTotal: { not: null }, status: "BOOKED" },
    select: { id: true, bookedAt: true, amountBase: true, amount: true, instalmentNumber: true, instalmentTotal: true, descriptionRedacted: true },
  });
  const future = instalmentRows.flatMap((t) =>
    projectRemainingInstalments({
      id: t.id,
      bookedAt: t.bookedAt,
      amountBase: num(t.amountBase ?? t.amount),
      instalmentNumber: t.instalmentNumber ?? 1,
      instalmentTotal: t.instalmentTotal ?? 1,
      descriptionRedacted: t.descriptionRedacted,
    }),
  );
  const committedInstalmentsBase = committedInstalmentsInWindow(future, new Date(), a.safeToSpendWindowDays);

  // A bank-side card settlement with no linked card statement means the month's real
  // spend is only known in aggregate — the period says AGGREGATE_ONLY rather than
  // silently dropping the itemisation it never received.
  const { start: mStart, end: mEnd } = monthBounds(year, month);
  const unreconciled = await db.transaction.count({
    where: {
      householdId,
      settlementLinkId: null,
      category: { key: "transfers.card_settlement" },
      bookedAt: { gte: mStart, lte: mEnd },
    },
  });

  const flow = computeMonthlyCashFlow({
    year, month, transactions: txns, debtServiceBase,
    hasKnownMissingSource: false,
    hasUnreconciledSettlement: unreconciled > 0,
  });

  const period = await db.operatingPeriod.findUnique({
    where: { householdId_year_month: { householdId, year, month } },
    select: { id: true },
  });
  const surplus = computeVerifiedSurplus(flow, period?.id ?? "", debtServiceBase);

  const safeToSpend = flow.ok
    ? computeSafeToSpend({
        flow,
        debtServiceBase,
        committedInWindowBase: committedInstalmentsBase,
        requiredBufferTopUpBase: 0, // buffer sizing arrives with the M41 hand-off
        windowDays: a.safeToSpendWindowDays,
      })
    : flow;

  const liquid = await db.ledgerItem.findMany({
    where: { householdId, status: "ACTIVE", kind: "ACCOUNT", accountDetail: { accountType: { in: ["BANK_CHECKING", "BANK_SAVINGS"] } } },
    select: { valuations: { orderBy: { asOf: "desc" }, take: 1, select: { value: true } } },
  });
  const liquidBase = liquid.reduce((s, i) => s + num(i.valuations[0]?.value), 0);

  return {
    flow,
    surplus,
    safeToSpend,
    workingCapital: computeWorkingCapital(
      liquidBase,
      committedInstalmentsBase,
      flow.ok ? flow.expensesBase : 0,
      a.workingCapitalMonths,
    ),
    committedInstalmentsBase,
    engineVersion: OPERATIONS_ENGINE_VERSION,
    pins: a.pins,
  };
}
