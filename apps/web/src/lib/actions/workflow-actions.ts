"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { str } from "./form-helpers";

export async function transitionAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const to = str(fd, "to");
  const trpc = await serverCaller();
  try {
    await trpc.workflow.transition({
      to: to as never,
      reason: str(fd, "reason") || `UI transition to ${to}`,
    });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/verification?error=${code}`);
  }
  redirect(`/${locale}/verification`);
}
