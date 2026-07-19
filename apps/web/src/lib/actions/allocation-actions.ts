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


export async function chooseVariantAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.allocation.chooseVariant({ id: str(fd, "id"), variant: str(fd, "variant") as never });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 120)) : "UNKNOWN";
    redirect(`/${locale}/allocation?error=${code}`);
  }
  redirect(`/${locale}/allocation`);
}

export async function decideStepAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.allocation.decideStep({
      id: str(fd, "id"),
      stepId: str(fd, "stepId"),
      decision: str(fd, "decision") as never,
    });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 120)) : "UNKNOWN";
    redirect(`/${locale}/allocation?error=${code}`);
  }
  redirect(`/${locale}/allocation`);
}
