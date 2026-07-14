"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { opt, str } from "./form-helpers";

export async function runMonteCarloAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  let view = "";
  try {
    const res = await trpc.scenarios.runMonteCarlo({ years: Number(opt(fd, "years") ?? 20) });
    view = `?view=${res.scenarioId}`;
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/scenarios?error=${code}`);
  }
  redirect(`/${locale}/scenarios${view}`);
}

export async function runScenarioAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  let id = "";
  try {
    const r = await trpc.scenarios.run({
      type: str(fd, "type") as never,
      overrides: { years: Number(opt(fd, "years") ?? 20) },
    });
    id = r.scenarioId;
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/scenarios?error=${code}`);
  }
  redirect(`/${locale}/scenarios?view=${id}`);
}
