"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { str } from "./form-helpers";

export async function reviewTaxRuleAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const taxYear = Number(str(fd, "taxYear"));
  const ruleType = str(fd, "ruleType");
  const trpc = await serverCaller();
  await trpc.registry.reviewTaxRule({ taxYear, ruleType: ruleType as never });
  redirect(`/${locale}/registry?year=${taxYear}&reviewed=1`);
}

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

export async function applyWizardAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const trpc = await serverCaller();
  try {
    const num = (name: string, fallback: number) => Number(str(fd, name) || fallback);
    const { changed } = await trpc.registry.applyWizard({
      bufferMonths: num("bufferMonths", 6) as never,
      spendRigidity: num("spendRigidity", 2) as never,
      nagging: num("nagging", 2) as never,
      concentrationSensitivity: num("concentrationSensitivity", 2) as never,
      israelDependence: num("israelDependence", 2) as never,
      regretType: num("regretType", 2) as never,
      homeView: num("homeView", 2) as never,
      driftSpeed: num("driftSpeed", 2) as never,
      feeImportance: num("feeImportance", 2) as never,
      largeLoanBase: num("largeLoanBase", 100000),
      institutionDependence: num("institutionDependence", 2) as never,
      paymentRiseSensitivity: num("paymentRiseSensitivity", 2) as never,
      dataStrictness: num("dataStrictness", 2) as never,
      taxablePortfolioAge: num("taxablePortfolioAge", 2) as never,
      advicePriority: num("advicePriority", 4) as never,
    });
    redirect(`/${locale}/registry?wizardChanged=${encodeURIComponent(changed.join(","))}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // NEXT_REDIRECT passthrough
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 80)) : "UNKNOWN";
    redirect(`/${locale}/registry/wizard?error=${code}`);
  }
}
