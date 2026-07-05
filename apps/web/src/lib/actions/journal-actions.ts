"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { str } from "./form-helpers";

export async function recordOutcomeAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.journal.recordOutcome({ entryId: str(fd, "entryId"), actualOutcome: str(fd, "actualOutcome") });
  redirect(`/${locale}/journal`);
}
