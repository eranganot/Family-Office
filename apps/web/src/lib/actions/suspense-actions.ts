"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { opt, ownership, str, valuation } from "./form-helpers";

export async function discardSuspenseAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.suspense.discard({ id: str(fd, "id"), note: str(fd, "note") || "-" });
  redirect(`/${locale}/documents`);
}

export async function linkSuspenseAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.suspense.linkToExisting({ id: str(fd, "id"), ledgerItemId: str(fd, "ledgerItemId") });
  redirect(`/${locale}/documents`);
}

export async function createFromSuspenseAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const suspenseId = str(fd, "id");
  const trpc = await serverCaller();
  let createdId: string | undefined;
  try {
    const created = await trpc.accounts.create({
      name: str(fd, "name"),
      currency: str(fd, "currency") as never,
      notes: opt(fd, "notes"),
      ownership: ownership(fd),
      accountType: str(fd, "accountType") as never,
      institutionName: str(fd, "institutionName"),
      accountNumberMasked: opt(fd, "accountNumberMasked"),
      trackName: opt(fd, "trackName"),
      managementFeePct: opt(fd, "managementFeePct"),
      depositFeePct: opt(fd, "depositFeePct"),
      initialValuation: valuation(fd),
    } as never);
    createdId = created.id;
    await trpc.suspense.markResolved({ id: suspenseId, ledgerItemId: created.id });
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/verification/suspense/${suspenseId}?error=${code}`);
  }
  redirect(`/${locale}/documents?resolved=${createdId}`);
}
