"use server";

import { redirect } from "next/navigation";
import { serverCaller } from "../trpc-server";
import { bool, opt, ownership, str, valuation } from "./form-helpers";

type Caller = Awaited<ReturnType<typeof serverCaller>>;

async function run(locale: string, backTo: string, fn: (trpc: Caller) => Promise<unknown>): Promise<never> {
  const trpc = await serverCaller();
  try {
    await fn(trpc);
  } catch (e) {
    const code = e instanceof Error ? encodeURIComponent(e.message.slice(0, 120)) : "UNKNOWN";
    redirect(`/${locale}${backTo}?error=${code}`);
  }
  redirect(`/${locale}/mapping`);
}

export async function createAccountAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping/new/account", (trpc) =>
    trpc.accounts.create({
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
      growthSharePct: opt(fd, "growthSharePct"),
      employerName: opt(fd, "employerName"),
      openedAt: opt(fd, "openedAt"),
      liquidityClass: opt(fd, "liquidityClass") as never,
      initialValuation: valuation(fd),
    } as never),
  );
}

export async function createRealEstateAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping/new/real-estate", (trpc) =>
    trpc.property.createRealEstate({
      name: str(fd, "name"),
      currency: str(fd, "currency") as never,
      notes: opt(fd, "notes"),
      ownership: ownership(fd),
      address: str(fd, "address"),
      city: opt(fd, "city"),
      propertyType: str(fd, "propertyType") as never,
      isPrimaryResidence: bool(fd, "isPrimaryResidence"),
      purchaseDate: opt(fd, "purchaseDate"),
      purchasePrice: opt(fd, "purchasePrice"),
      initialValuation: valuation(fd),
    } as never),
  );
}

export async function createMortgageAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const tracks: Array<{
    trackType: string; principalRemaining: string; annualRatePct: string;
    cpiLinked: boolean; monthlyPayment: string | undefined; endDate: string;
  }> = [];
  for (let i = 0; i < 4; i++) {
    const principal = opt(fd, `track_${i}_principal`);
    if (!principal) continue;
    tracks.push({
      trackType: str(fd, `track_${i}_type`),
      principalRemaining: principal,
      annualRatePct: opt(fd, `track_${i}_rate`) ?? "0",
      cpiLinked: bool(fd, `track_${i}_cpi`),
      monthlyPayment: opt(fd, `track_${i}_payment`),
      endDate: opt(fd, `track_${i}_end`) ?? new Date().toISOString(),
    });
  }
  await run(locale, "/mapping/new/mortgage", (trpc) =>
    trpc.property.createMortgage({
      name: str(fd, "name"),
      currency: str(fd, "currency") as never,
      notes: opt(fd, "notes"),
      ownership: ownership(fd),
      lenderName: opt(fd, "lenderName"),
      linkedPropertyId: opt(fd, "linkedPropertyId"),
      startDate: opt(fd, "startDate") ?? new Date().toISOString(),
      tracks,
    } as never),
  );
}

export async function createCashFlowAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping/new/cash-flow", (trpc) =>
    trpc.flows.createCashFlow({
      name: str(fd, "name"),
      currency: str(fd, "currency") as never,
      notes: opt(fd, "notes"),
      ownership: ownership(fd),
      flowType: str(fd, "flowType") as never,
      amount: str(fd, "amount"),
      frequency: str(fd, "frequency") as never,
      startDate: opt(fd, "startDate") ?? new Date().toISOString(),
      endDate: opt(fd, "endDate"),
      isGross: bool(fd, "isGross"),
    } as never),
  );
}

export async function createInsuranceAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping/new/insurance", (trpc) =>
    trpc.flows.createInsurance({
      name: str(fd, "name"),
      currency: str(fd, "currency") as never,
      notes: opt(fd, "notes"),
      ownership: ownership(fd),
      policyType: str(fd, "policyType") as never,
      coverageAmount: opt(fd, "coverageAmount"),
      monthlyPremium: opt(fd, "monthlyPremium"),
      throughPension: bool(fd, "throughPension"),
      insuredMemberId: opt(fd, "insuredMemberId"),
      endDate: opt(fd, "endDate"),
    } as never),
  );
}

export async function createLoanAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping/new/loan", (trpc) =>
    trpc.flows.createLoan({
      name: str(fd, "name"),
      currency: str(fd, "currency") as never,
      notes: opt(fd, "notes"),
      ownership: ownership(fd),
      lenderName: opt(fd, "lenderName"),
      principalRemaining: str(fd, "principalRemaining"),
      annualRatePct: opt(fd, "annualRatePct") ?? "0",
      endDate: opt(fd, "endDate"),
      purpose: opt(fd, "purpose"),
    } as never),
  );
}

export async function createOtherAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const kind = str(fd, "kind") as "OTHER_ASSET" | "OTHER_LIABILITY";
  await run(locale, `/mapping/new/${kind === "OTHER_ASSET" ? "other-asset" : "other-liability"}`, (trpc) =>
    trpc.ledger.createOther({
      kind,
      name: str(fd, "name"),
      currency: str(fd, "currency") as never,
      notes: opt(fd, "notes"),
      ownership: ownership(fd),
      initialValuation: valuation(fd),
    } as never),
  );
}

export async function addValuationAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping", (trpc) =>
    trpc.ledger.addValuation({
      ledgerItemId: str(fd, "ledgerItemId"),
      asOf: opt(fd, "valueDate") ?? new Date().toISOString(),
      value: str(fd, "value"),
      currency: str(fd, "currency") as never,
      confidence: Number(opt(fd, "confidence") ?? 50),
    } as never),
  );
}

export async function closeItemAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping", (trpc) => trpc.ledger.close({ id: str(fd, "id") }));
}

export async function updateAccountAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const id = str(fd, "id");
  await run(locale, `/mapping/edit/${id}`, (trpc) =>
    trpc.accounts.update({
      id,
      name: str(fd, "name"),
      notes: opt(fd, "notes"),
      accountType: str(fd, "accountType") as never,
      institutionName: opt(fd, "institutionName"),
      accountNumberMasked: opt(fd, "accountNumberMasked"),
      trackName: opt(fd, "trackName"),
      managementFeePct: opt(fd, "managementFeePct"),
      depositFeePct: opt(fd, "depositFeePct"),
      growthSharePct: opt(fd, "growthSharePct"),
      employerName: opt(fd, "employerName"),
      openedAt: opt(fd, "openedAt"),
      liquidityClass: opt(fd, "liquidityClass") as never,
    } as never),
  );
}

export async function updateRealEstateAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const id = str(fd, "id");
  await run(locale, `/mapping/edit/${id}`, (trpc) =>
    trpc.property.updateRealEstate({
      id,
      name: str(fd, "name"),
      notes: opt(fd, "notes"),
      address: opt(fd, "address"),
      city: opt(fd, "city"),
      propertyType: str(fd, "propertyType") as never,
      isPrimaryResidence: bool(fd, "isPrimaryResidence"),
      purchaseDate: opt(fd, "purchaseDate"),
      purchasePrice: opt(fd, "purchasePrice"),
    } as never),
  );
}

export async function updateMortgageAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const id = str(fd, "id");
  const tracks: Array<{
    trackType: string; principalRemaining: string; annualRatePct: string;
    cpiLinked: boolean; monthlyPayment: string | undefined; endDate: string;
  }> = [];
  for (let i = 0; i < 4; i++) {
    const principal = opt(fd, `track_${i}_principal`);
    if (!principal) continue;
    tracks.push({
      trackType: str(fd, `track_${i}_type`),
      principalRemaining: principal,
      annualRatePct: opt(fd, `track_${i}_rate`) ?? "0",
      cpiLinked: bool(fd, `track_${i}_cpi`),
      monthlyPayment: opt(fd, `track_${i}_payment`),
      endDate: opt(fd, `track_${i}_end`) ?? new Date().toISOString(),
    });
  }
  await run(locale, `/mapping/edit/${id}`, (trpc) =>
    trpc.property.updateMortgage({
      id,
      name: str(fd, "name"),
      notes: opt(fd, "notes"),
      linkedPropertyId: opt(fd, "linkedPropertyId") ?? null,
      startDate: opt(fd, "startDate"),
      ...(tracks.length > 0 ? { tracks } : {}),
    } as never),
  );
}

export async function updateCashFlowAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const id = str(fd, "id");
  await run(locale, `/mapping/edit/${id}`, (trpc) =>
    trpc.flows.updateCashFlow({
      id,
      name: str(fd, "name"),
      notes: opt(fd, "notes"),
      flowType: str(fd, "flowType") as never,
      amount: opt(fd, "amount"),
      frequency: str(fd, "frequency") as never,
      startDate: opt(fd, "startDate"),
      endDate: opt(fd, "endDate"),
      isGross: bool(fd, "isGross"),
    } as never),
  );
}

export async function updateInsuranceAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const id = str(fd, "id");
  await run(locale, `/mapping/edit/${id}`, (trpc) =>
    trpc.flows.updateInsurance({
      id,
      name: str(fd, "name"),
      notes: opt(fd, "notes"),
      policyType: str(fd, "policyType") as never,
      coverageAmount: opt(fd, "coverageAmount"),
      monthlyPremium: opt(fd, "monthlyPremium"),
      throughPension: bool(fd, "throughPension"),
      insuredMemberId: opt(fd, "insuredMemberId") ?? null,
      endDate: opt(fd, "endDate"),
    } as never),
  );
}

export async function updateLoanAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const id = str(fd, "id");
  await run(locale, `/mapping/edit/${id}`, (trpc) =>
    trpc.flows.updateLoan({
      id,
      name: str(fd, "name"),
      notes: opt(fd, "notes"),
      lenderName: opt(fd, "lenderName"),
      principalRemaining: opt(fd, "principalRemaining"),
      annualRatePct: opt(fd, "annualRatePct"),
      endDate: opt(fd, "endDate"),
      purpose: opt(fd, "purpose"),
    } as never),
  );
}

export async function updateBaseAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  const id = str(fd, "id");
  await run(locale, `/mapping/edit/${id}`, (trpc) =>
    trpc.ledger.updateBase({ id, name: str(fd, "name"), notes: opt(fd, "notes") }),
  );
}

export async function suggestGrowthSharesAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping", async (trpc) => {
    const r = await trpc.accounts.suggestGrowthShares();
    return r;
  });
}

export async function confirmGrowthShareAction(fd: FormData): Promise<void> {
  const locale = str(fd, "locale");
  await run(locale, "/mapping", (trpc) => trpc.accounts.confirmGrowthShare({ id: str(fd, "id") }));
}
