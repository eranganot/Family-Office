"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { str } from "./form-helpers";

export async function setAssumptionAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const key = str(fd, "key");
  const raw = str(fd, "value");
  const trpc = await serverCaller();
  try {
    // Numbers are the common case; JSON objects (e.g. weights) accepted when parseable.
    let value: number | Record<string, number>;
    if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
    else value = JSON.parse(raw) as Record<string, number>;
    await trpc.registry.setAssumption({ key, value });
  } catch {
    redirect(`/${locale}/registry?error=INVALID_VALUE`);
  }
  redirect(`/${locale}/registry`);
}
