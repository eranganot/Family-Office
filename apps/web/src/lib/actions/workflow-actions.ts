"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { str } from "./form-helpers";

const PAGE: Record<string, string> = {
  MAPPING: "mapping", VERIFICATION: "verification", ALLOCATION: "allocation", STRATEGY: "strategy", MONITORING: "monitoring",
};

export async function transitionAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const to = str(fd, "to");
  const from = str(fd, "from") || "verification";
  const trpc = await serverCaller();
  try {
    await trpc.workflow.transition({ to: to as never, reason: str(fd, "reason") || `UI transition to ${to}` });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/${PAGE[from] ?? "verification"}?error=${code}`);
  }
  redirect(`/${locale}/${PAGE[to] ?? "verification"}`);
}
