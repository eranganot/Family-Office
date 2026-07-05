"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { str } from "./form-helpers";

export async function verifyItemAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.verification.verify({ itemId: str(fd, "itemId") });
  redirect(`/${locale}/verification`);
}

export async function rejectItemAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  const note = str(fd, "note") || "-";
  await trpc.verification.reject({ itemId: str(fd, "itemId"), note });
  redirect(`/${locale}/verification`);
}
