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

export async function decideAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.strategy.decide({
    id: str(fd, "id"),
    decision: str(fd, "decision") as never,
    note: opt(fd, "note"),
  });
  redirect(`/${locale}/strategy`);
}
