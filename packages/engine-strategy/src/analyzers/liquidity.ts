import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";
import { isCash, isLiquid, sum, valued } from "./pools";

export function analyzeLiquidity(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const targetMonths = Number(ctx.assumptions["emergency_fund_months"] ?? 6);

  const monthlyExpenses = snapshot.items
    .filter((i) => i.cashFlow?.direction === "OUT" && i.cashFlow.amountBase !== null)
    .reduce((s, i) => {
      const amount = i.cashFlow!.amountBase!;
      return s + (i.cashFlow!.frequency === "ANNUAL" ? amount / 12 : i.cashFlow!.frequency === "MONTHLY" ? amount : 0);
    }, 0);

  const liquidItems = valued(snapshot.items).filter(isLiquid);
  const cashItems = valued(snapshot.items).filter(isCash);
  const liquidTotal = sum(liquidItems);
  const cashTotal = sum(cashItems);

  if (monthlyExpenses <= 0) {
    findings.push({
      code: "LIQUIDITY_UNKNOWN_EXPENSES",
      severity: "NOTICE",
      metrics: { liquidTotal: Math.round(liquidTotal) },
      evidenceItemIds: [],
    });
    return findings;
  }

  const runwayMonths = liquidTotal / monthlyExpenses;
  const cashMonths = cashTotal / monthlyExpenses;

  if (runwayMonths < targetMonths) {
    findings.push({
      code: "LIQUIDITY_BELOW_TARGET",
      severity: "WARNING",
      metrics: { runwayMonths: round1(runwayMonths), targetMonths, monthlyExpenses: Math.round(monthlyExpenses), liquidTotal: Math.round(liquidTotal) },
      evidenceItemIds: liquidItems.map((i) => i.id),
    });
  }
  // Cash sitting far beyond the emergency target erodes to inflation — unless the approved
  // allocation plan already deploys the surplus (M30 alignment).
  if (cashMonths > targetMonths * 2 && !ctx.committedPlan?.deploysIdleCash) {
    findings.push({
      code: "EXCESS_IDLE_CASH",
      severity: "NOTICE",
      metrics: { cashMonths: round1(cashMonths), targetMonths, cashTotal: Math.round(cashTotal) },
      evidenceItemIds: cashItems.map((i) => i.id),
    });
  }
  return findings;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
