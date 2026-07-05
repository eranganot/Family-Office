"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { opt, str } from "./form-helpers";

export async function bootstrapHouseholdAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.household.bootstrap({
      name: str(fd, "name"),
      baseCurrency: str(fd, "baseCurrency") as never,
      locale: locale as never,
      timezone: opt(fd, "timezone") ?? "Asia/Jerusalem",
    });
  } catch {
    redirect(`/${locale}/household?error=bootstrap`);
  }
  redirect(`/${locale}/household`);
}

export async function addMemberAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.household.addMember({
      name: str(fd, "name"),
      role: str(fd, "role") as never,
      birthDate: opt(fd, "birthDate") as never,
      taxResidency: opt(fd, "taxResidency") ?? "IL",
      employmentStatus: opt(fd, "employmentStatus") as never,
    });
  } catch {
    redirect(`/${locale}/household?error=member`);
  }
  redirect(`/${locale}/household`);
}

export async function archiveMemberAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  await trpc.household.archiveMember({ id: str(fd, "id") });
  redirect(`/${locale}/household`);
}

export async function setFxRateAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    await trpc.networth.setFxRate({
      from: str(fd, "from") as never,
      to: str(fd, "to") as never,
      rate: str(fd, "rate"),
      asOf: opt(fd, "asOf") ?? new Date().toISOString(),
    } as never);
  } catch {
    redirect(`/${locale}/fx?error=rate`);
  }
  redirect(`/${locale}/fx`);
}
