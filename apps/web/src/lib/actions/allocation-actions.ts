"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { opt, str } from "./form-helpers";

export async function generatePlanAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.allocation.generate();
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 120)) : "UNKNOWN";
    redirect(`/${locale}/allocation?error=${code}`);
  }
  redirect(`/${locale}/allocation`);
}

export async function approvePlanAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.allocation.approve({ id: str(fd, "id"), note: opt(fd, "note") });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 120)) : "UNKNOWN";
    redirect(`/${locale}/allocation?error=${code}`);
  }
  redirect(`/${locale}/allocation`);
}
