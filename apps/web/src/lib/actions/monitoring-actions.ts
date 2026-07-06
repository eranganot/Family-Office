"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { str } from "./form-helpers";

export async function runMonitoringAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.monitoring.runNow();
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/monitoring?error=${code}`);
  }
  redirect(`/${locale}/monitoring`);
}

export async function acknowledgeAlertAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.monitoring.acknowledgeAlert({ id: str(fd, "id") });
  } catch {
    /* best-effort; page re-renders current state */
  }
  redirect(`/${locale}/monitoring`);
}

export async function reevaluateAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const target = str(fd, "target");
  const trpc = await serverCaller();
  try {
    await trpc.monitoring.reevaluate({ target: target as never, reason: str(fd, "reason") || `re-evaluate to ${target}` });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/monitoring?error=${code}`);
  }
  // Land on the page the household now needs to act in.
  redirect(`/${locale}/${target === "VERIFICATION" ? "verification" : "strategy"}`);
}
