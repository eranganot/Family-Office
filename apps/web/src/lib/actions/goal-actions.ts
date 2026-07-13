"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { opt, str } from "./form-helpers";

export async function createGoalAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.goals.create({
      type: str(fd, "type") as never,
      name: str(fd, "name"),
      priority: Number(opt(fd, "priority") ?? 5),
      targetDate: opt(fd, "targetDate") as never,
      requiredFunding: opt(fd, "requiredFunding"),
      riskTolerance: (opt(fd, "riskTolerance") ?? "MEDIUM") as never,
      dependsOnGoalIds: fd.getAll("dependsOn").map(String).filter(Boolean),
    } as never);
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/goals?error=${code}`);
  }
  redirect(`/${locale}/goals`);
}

export async function setGoalStatusAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.goals.setStatus({ id: str(fd, "id"), status: str(fd, "status") as never });
  redirect(`/${locale}/goals`);
}

export async function updateGoalAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.goals.update({
      id: str(fd, "id"),
      name: str(fd, "name"),
      type: str(fd, "type") as never,
      priority: Number(opt(fd, "priority") ?? 5),
      targetDate: opt(fd, "targetDate") as never,
      requiredFunding: opt(fd, "requiredFunding"),
      riskTolerance: (opt(fd, "riskTolerance") ?? "MEDIUM") as never,
      dependsOnGoalIds: fd.getAll("dependsOn").map(String).filter(Boolean),
    } as never);
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/goals?error=${code}`);
  }
  redirect(`/${locale}/goals`);
}
