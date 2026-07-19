"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { opt, str } from "./form-helpers";

async function run(locale: string, fn: (trpc: Awaited<ReturnType<typeof serverCaller>>) => Promise<unknown>): Promise<never> {
  const trpc = await serverCaller();
  try {
    await fn(trpc);
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 120)) : "UNKNOWN";
    redirect(`/${locale}/allocation?error=${code}`);
  }
  redirect(`/${locale}/allocation`);
}

export async function generatePlanAction(fd: FormData): Promise<void> {
  await run(str(fd, "locale"), (trpc) => trpc.allocation.generate());
}

export async function applyPresetAction(fd: FormData): Promise<void> {
  await run(str(fd, "locale"), (trpc) =>
    trpc.allocation.applyPreset({ id: str(fd, "id"), variant: str(fd, "variant") as never }),
  );
}

export async function setCandidateAction(fd: FormData): Promise<void> {
  const amountRaw = opt(fd, "amount");
  await run(str(fd, "locale"), (trpc) =>
    trpc.allocation.setCandidate({
      id: str(fd, "id"),
      candidateId: str(fd, "candidateId"),
      enabled: str(fd, "enabled") === "1",
      ...(amountRaw !== undefined ? { amount: Number(amountRaw) } : {}),
    }),
  );
}

export async function approveWorkingPlanAction(fd: FormData): Promise<void> {
  await run(str(fd, "locale"), (trpc) =>
    trpc.allocation.approve({ id: str(fd, "id"), note: opt(fd, "note") }),
  );
}
