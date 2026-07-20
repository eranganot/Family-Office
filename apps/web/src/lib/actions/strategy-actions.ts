"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { opt, str } from "./form-helpers";

export async function runStrategyAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  let query = "";
  try {
    const result = await trpc.strategy.run();
    query = result.ran
      ? `?ran=1&created=${result.created}&superseded=${result.supersededCount}`
      : `?gap=${encodeURIComponent(result.dataGap.guidance.join(","))}`;
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/strategy?error=${code}`);
  }
  redirect(`/${locale}/strategy${query}`);
}

export async function updateGoalPlanAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  const priorityRaw = opt(fd, "priority");
  const requiredRaw = opt(fd, "requiredFunding");
  await trpc.goals.update({
    id: str(fd, "id"),
    ...(priorityRaw ? { priority: Number(priorityRaw) } : {}),
    ...(requiredRaw ? { requiredFunding: requiredRaw } : {}),
  } as never);
  redirect(`/${locale}/strategy?ok=goalTuned`);
}

export async function decideAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.strategy.decide({
    id: str(fd, "id"),
    decision: str(fd, "decision") as never,
    note: opt(fd, "note"),
    expectedOutcome: opt(fd, "expectedOutcome"),
    implementationDate: opt(fd, "implementationDate") as never,
  } as never);
  redirect(`/${locale}/strategy`);
}

export async function dismissRecommendationAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.strategy.dismiss({ id: str(fd, "id") });
  redirect(`/${locale}/strategy?ok=recDismissed`);
}

export async function markImplementedAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.strategy.markImplemented({ id: str(fd, "id"), actualOutcome: opt(fd, "actualOutcome") });
  redirect(`/${locale}/strategy?ok=recImplemented`);
}

export async function saveRiskAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    const current = await trpc.registry.assumptions();
    const byKey = new Map(current.map((a) => [a.key, a.value]));
    for (const key of ["risk_loss_tolerance", "risk_income_stability", "risk_horizon_years", "risk_drawdown_reaction", "risk_investment_experience", "risk_spending_flexibility"] as const) {
      const raw = str(fd, key);
      if (raw === "") continue;
      const value = Number(raw);
      if (Number.isNaN(value)) continue;
      if (Number(byKey.get(key)) === value) continue; // unchanged — no new version, no invalidation
      await trpc.registry.setAssumption({ key, value });
    }
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/strategy?error=${code}`);
  }
  redirect(`/${locale}/strategy?savedRisk=1`);
}
