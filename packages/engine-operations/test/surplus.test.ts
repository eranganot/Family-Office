import { describe, expect, it } from "vitest";
import {
  computeMonthlyCashFlow,
  computeSafeToSpend,
  computeVerifiedSurplus,
  computeWorkingCapital,
  type PeriodInput,
  type TxnView,
} from "../src/surplus";
import { isRefusal, type MonthlyCashFlow } from "../src/types";

let seq = 0;
function txn(over: Partial<TxnView>): TxnView {
  seq += 1;
  return {
    id: `t${seq}`,
    bookedAt: new Date("2026-07-10T00:00:00Z"),
    amountBase: -100,
    currency: "ILS",
    status: "BOOKED",
    categoryId: "c1",
    categoryKey: "food.groceries",
    categoryAxis: "EXPENSE",
    behavioral: "VARIABLE_DISCRETIONARY",
    unverified: false,
    ...over,
  };
}

const period = (txns: TxnView[], over: Partial<PeriodInput> = {}): PeriodInput => ({
  year: 2026,
  month: 7,
  transactions: txns,
  debtServiceBase: 0,
  hasKnownMissingSource: false,
  hasUnreconciledSettlement: false,
  ...over,
});

const ok = (r: ReturnType<typeof computeMonthlyCashFlow>): MonthlyCashFlow => {
  if (isRefusal(r)) throw new Error(`expected ok, got refusal ${r.reason}`);
  return r;
};

describe("computeMonthlyCashFlow — what counts", () => {
  it("nets income against expenses", () => {
    const r = ok(computeMonthlyCashFlow(period([
      txn({ amountBase: 28000, categoryKey: "income.salary.base", categoryAxis: "INCOME", behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -1200 }),
    ])));
    expect(r.incomeBase).toBe(28000);
    expect(r.expensesBase).toBe(1200);
  });

  it("EXCLUDES pending transactions - an unsettled charge is not this month's money", () => {
    const r = ok(computeMonthlyCashFlow(period([
      txn({ amountBase: 5000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -900, status: "PENDING" }),
      txn({ amountBase: -100, status: "VOID" }),
    ])));
    expect(r.expensesBase).toBe(0);
  });

  it("EXCLUDES transfers from both sides - this is the card-settlement double-count guard", () => {
    // The bank shows the card bill as one aggregate debit; the card statement itemises it.
    const r = ok(computeMonthlyCashFlow(period([
      txn({ amountBase: 20000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -5611.17, behavioral: "TRANSFER", categoryKey: "transfers.card_settlement" }), // bank side
      txn({ amountBase: -3000, behavioral: "VARIABLE_DISCRETIONARY" }),                                 // itemised card side
      txn({ amountBase: -2611.17, behavioral: "VARIABLE_DISCRETIONARY" }),                              // itemised card side
    ])));
    expect(r.expensesBase).toBe(5611.17);          // itemised only, NOT 11222.34
    expect(r.transfersExcludedBase).toBe(5611.17);
  });

  it("treats pension/hishtalmut as SAVINGS_FLOW, not expense (owner decision D7)", () => {
    const r = ok(computeMonthlyCashFlow(period([
      txn({ amountBase: 20000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -2000, behavioral: "SAVINGS_FLOW", categoryKey: "savings.hishtalmut" }),
    ])));
    expect(r.expensesBase).toBe(0);
    expect(r.savingsFlowsBase).toBe(2000);
  });

  it("aggregates financial drag into leakage", () => {
    const r = ok(computeMonthlyCashFlow(period([
      txn({ amountBase: 10000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -14.18, behavioral: "FINANCIAL_DRAG", categoryKey: "financial_fees.card_fees" }),
      txn({ amountBase: -32.5, behavioral: "FINANCIAL_DRAG", categoryKey: "financial_fees.bank_fees" }),
    ])));
    expect(r.leakageBase).toBe(46.68);
  });

  it("REFUSES rather than treating a missing FX rate as zero", () => {
    const r = computeMonthlyCashFlow(period([
      txn({ amountBase: 10000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: null, currency: "USD" }),
    ]));
    expect(isRefusal(r)).toBe(true);
    if (isRefusal(r)) {
      expect(r.reason).toBe("MISSING_FX_RATE");
      expect(r.detail?.["currencies"]).toBe("USD");
    }
  });

  it("counts unverified transactions but reports them (non-blocking rule)", () => {
    const r = ok(computeMonthlyCashFlow(period([
      txn({ amountBase: 9000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -250, unverified: true }),
    ])));
    expect(r.expensesBase).toBe(250);      // counted, not dropped
    expect(r.unverifiedCount).toBe(1);
    expect(r.unverifiedAmountBase).toBe(250);
  });

  it("reports coverage honestly", () => {
    expect(ok(computeMonthlyCashFlow(period([txn({ amountBase: 100 })]))).coverage).toBe("COMPLETE");
    expect(ok(computeMonthlyCashFlow(period([txn({ amountBase: 100 })], { hasKnownMissingSource: true }))).coverage).toBe("PARTIAL");
    expect(ok(computeMonthlyCashFlow(period([txn({ amountBase: 100 })], { hasUnreconciledSettlement: true }))).coverage).toBe("AGGREGATE_ONLY");
  });
});

describe("computeVerifiedSurplus", () => {
  const flow = () => computeMonthlyCashFlow(period([
    txn({ amountBase: 28000, behavioral: "FIXED_CONTRACTUAL" }),
    txn({ amountBase: -9000, behavioral: "FIXED_CONTRACTUAL" }),
    txn({ amountBase: -3000, behavioral: "VARIABLE_DISCRETIONARY" }),
    txn({ amountBase: -2000, behavioral: "SAVINGS_FLOW" }),
  ]));

  it("subtracts expenses and ledger debt service, but NOT savings flows", () => {
    const s = computeVerifiedSurplus(flow(), "p1", 6000);
    expect(isRefusal(s)).toBe(false);
    if (!isRefusal(s)) expect(s.monthlyBase).toBe(10000); // 28000 - 12000 - 6000
  });

  it("refuses when no income is mapped", () => {
    const s = computeVerifiedSurplus(computeMonthlyCashFlow(period([txn({ amountBase: -500 })])), "p1", 0);
    expect(isRefusal(s)).toBe(true);
    if (isRefusal(s)) expect(s.reason).toBe("NO_INCOME_MAPPED");
  });

  it("marks the surplus provisional when the month has unverified rows", () => {
    const f = computeMonthlyCashFlow(period([
      txn({ amountBase: 28000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -100, unverified: true }),
    ]));
    const s = computeVerifiedSurplus(f, "p1", 0);
    if (!isRefusal(s)) expect(s.provisional).toBe(true);
  });

  it("propagates a refusal instead of inventing a surplus", () => {
    const f = computeMonthlyCashFlow(period([txn({ amountBase: null, currency: "USD" })]));
    expect(isRefusal(computeVerifiedSurplus(f, "p1", 0))).toBe(true);
  });
});

describe("computeSafeToSpend", () => {
  it("subtracts fixed, debt and commitments - but NOT discretionary spend", () => {
    const f = ok(computeMonthlyCashFlow(period([
      txn({ amountBase: 28000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -9000, behavioral: "FIXED_CONTRACTUAL" }),
      txn({ amountBase: -4000, behavioral: "VARIABLE_DISCRETIONARY" }),
    ])));
    const r = computeSafeToSpend({
      flow: f,
      debtServiceBase: 6000,
      committedInWindowBase: 1600,
      requiredBufferTopUpBase: 1000,
      windowDays: 30,
    });
    expect(isRefusal(r)).toBe(false);
    // 28000 - 9000 fixed - 6000 debt - 1600 committed - 1000 buffer = 10400.
    // The 4000 already spent discretionary is deliberately NOT subtracted.
    if (!isRefusal(r)) expect(r.safeToSpendBase).toBe(10400);
  });

  it("refuses when expenses are unmapped rather than returning the whole income", () => {
    const f = ok(computeMonthlyCashFlow(period([txn({ amountBase: 28000, behavioral: "FIXED_CONTRACTUAL" })])));
    const r = computeSafeToSpend({ flow: { ...f, expensesBase: 0, byBehavioral: { ...f.byBehavioral, FIXED_CONTRACTUAL: 0 } }, debtServiceBase: 0, committedInWindowBase: 0, requiredBufferTopUpBase: 0, windowDays: 30 });
    expect(isRefusal(r)).toBe(true);
  });
});

describe("computeWorkingCapital", () => {
  it("nets committed outflows off liquid balances and sizes the target", () => {
    const r = computeWorkingCapital(50000, 8000, 12000, 1.5);
    expect(r.availableBase).toBe(42000);
    expect(r.targetBase).toBe(18000);
    expect(r.gapBase).toBe(0);
  });
  it("reports a gap when the cushion is short", () => {
    expect(computeWorkingCapital(10000, 3000, 12000, 1.5).gapBase).toBe(11000);
  });
});
