import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  updateAccountAction,
  updateBaseAction,
  updateCashFlowAction,
  updateInsuranceAction,
  updateLoanAction,
  updateMortgageAction,
  updateRealEstateAction,
} from "../../../../../../lib/actions/mapping-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../../../components/fields";
import { serverCaller } from "../../../../../../lib/trpc-server";

const ACCOUNT_TYPES = [
  "BANK_CHECKING", "BANK_SAVINGS", "BANK_DEPOSIT", "BROKERAGE_IL", "BROKERAGE_FOREIGN",
  "PENSION_COMPREHENSIVE", "PENSION_GENERAL", "KUPAT_GEMEL", "GEMEL_LEHASHKAA",
  "KEREN_HISHTALMUT", "IRA_GEMEL", "FOREIGN_RETIREMENT", "CASH_OTHER",
] as const;
const TRACK_TYPES = ["PRIME", "FIXED_LINKED", "FIXED_UNLINKED", "VARIABLE_LINKED", "VARIABLE_UNLINKED", "FOREIGN_CURRENCY"] as const;
const FLOW_TYPES = [
  "SALARY", "SELF_EMPLOYMENT_INCOME", "RENTAL_INCOME", "PENSION_INCOME", "OTHER_INCOME",
  "LIVING_EXPENSE", "HOUSING_EXPENSE", "EDUCATION_EXPENSE", "INSURANCE_PREMIUM", "LOAN_PAYMENT", "OTHER_EXPENSE", "HISHTALMUT_CONTRIBUTION", "PENSION_CONTRIBUTION",
] as const;
const POLICY_TYPES = ["LIFE", "DISABILITY", "HEALTH", "LONG_TERM_CARE", "PROPERTY", "MORTGAGE_LIFE", "OTHER"] as const;

function dateVal(d: Date | string | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}
function numVal(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale, id } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("forms");
  const trpc = await serverCaller();

  let item: Awaited<ReturnType<typeof trpc.ledger.get>>;
  try {
    item = await trpc.ledger.get({ id });
  } catch {
    notFound();
  }

  const household = await trpc.household.get();
  const members = (household?.members ?? []).map((m) => ({ id: m.id, name: m.name }));
  const properties = item.kind === "MORTGAGE" ? await trpc.ledger.list({ kind: "REAL_ESTATE" }) : [];

  const actions: Record<string, (fd: FormData) => Promise<void>> = {
    ACCOUNT: updateAccountAction,
    REAL_ESTATE: updateRealEstateAction,
    MORTGAGE: updateMortgageAction,
    CASH_FLOW: updateCashFlowAction,
    INSURANCE: updateInsuranceAction,
    LOAN: updateLoanAction,
    OTHER_ASSET: updateBaseAction,
    OTHER_LIABILITY: updateBaseAction,
  };
  const action = actions[item.kind] ?? updateBaseAction;

  const acc = item.accountDetail;
  const re = item.realEstateDetail;
  const mort = item.mortgageDetail;
  const cf = item.cashFlowDetail;
  const ins = item.insuranceDetail;
  const loan = item.loanDetail;

  return (
    <Card title={`${t("editTitle")}: ${item.name}`}>
      <ErrorBanner message={error ? `${t("error")}: ${decodeURIComponent(error)}` : undefined} />
      <form action={action} className="flex max-w-2xl flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={item.id} />

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("name")}>
            <TextInput name="name" defaultValue={item.name} required />
          </Field>
          <Field label={t("currency")}>
            <TextInput name="currencyDisplay" defaultValue={item.currency} disabled />
          </Field>
        </div>

        {item.kind === "ACCOUNT" && acc ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("account.accountType")}>
              <Select name="accountType" defaultValue={acc.accountType}>
                {ACCOUNT_TYPES.map((a) => <option key={a} value={a}>{t(`accountTypes.${a}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("account.institution")}>
              <TextInput name="institutionName" defaultValue={acc.institution?.name ?? ""} />
            </Field>
            <Field label={t("account.accountNumberMasked")}>
              <TextInput name="accountNumberMasked" defaultValue={acc.accountNumberMasked ?? ""} />
            </Field>
            <Field label={t("account.trackName")}>
              <TextInput name="trackName" defaultValue={acc.trackName ?? ""} />
            </Field>
            <Field label={t("account.managementFeePct")}>
              <TextInput name="managementFeePct" inputMode="decimal" defaultValue={numVal(acc.managementFeePct)} />
            </Field>
            <Field label={t("account.depositFeePct")}>
              <TextInput name="depositFeePct" inputMode="decimal" defaultValue={numVal(acc.depositFeePct)} />
            </Field>
            <Field label={t("account.growthSharePct")}>
              <TextInput name="growthSharePct" inputMode="decimal" defaultValue={numVal(acc.growthSharePct)} />
            </Field>
            <Field label={t("account.employerName")}>
              <TextInput name="employerName" defaultValue={acc.employerName ?? ""} />
            </Field>
            <Field label={t("account.openedAt")}>
              <TextInput name="openedAt" type="date" defaultValue={dateVal(acc.openedAt)} />
            </Field>
            <Field label={t("account.liquidityClass")}>
              <Select name="liquidityClass" defaultValue={acc.liquidityClass ?? ""}>
                <option value=""></option>
                {(["LIQUID", "RESTRICTED", "LOCKED"] as const).map((l) => (
                  <option key={l} value={l}>{t(`account.${l}`)}</option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        {item.kind === "REAL_ESTATE" && re ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("realEstate.address")}>
              <TextInput name="address" defaultValue={re.address} required />
            </Field>
            <Field label={t("realEstate.city")}>
              <TextInput name="city" defaultValue={re.city ?? ""} />
            </Field>
            <Field label={t("realEstate.propertyType")}>
              <Select name="propertyType" defaultValue={re.propertyType}>
                {(["APARTMENT", "HOUSE", "LOT", "COMMERCIAL"] as const).map((p) => (
                  <option key={p} value={p}>{t(`realEstate.${p}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("realEstate.purchaseDate")}>
              <TextInput name="purchaseDate" type="date" defaultValue={dateVal(re.purchaseDate)} />
            </Field>
            <Field label={t("realEstate.purchasePrice")}>
              <TextInput name="purchasePrice" inputMode="decimal" defaultValue={numVal(re.purchasePrice)} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPrimaryResidence" defaultChecked={re.isPrimaryResidence} />
              {t("realEstate.isPrimaryResidence")}
            </label>
          </div>
        ) : null}

        {item.kind === "MORTGAGE" && mort ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("mortgage.linkedProperty")}>
                <Select name="linkedPropertyId" defaultValue={mort.linkedPropertyId ?? ""}>
                  <option value="">{t("mortgage.none")}</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label={t("mortgage.startDate")}>
                <TextInput name="startDate" type="date" defaultValue={dateVal(mort.startDate)} />
              </Field>
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm text-neutral-600">{t("mortgage.tracks")}</legend>
              {[0, 1, 2, 3].map((i) => {
                const track = mort.tracks[i];
                return (
                  <div key={i} className="grid grid-cols-6 items-end gap-2 rounded-lg border border-neutral-100 p-2">
                    <Field label={`${t("mortgage.track")} ${i + 1}`}>
                      <Select name={`track_${i}_type`} defaultValue={track?.trackType ?? "PRIME"}>
                        {TRACK_TYPES.map((tt) => <option key={tt} value={tt}>{t(`mortgage.${tt}`)}</option>)}
                      </Select>
                    </Field>
                    <Field label={t("mortgage.principalRemaining")}>
                      <TextInput name={`track_${i}_principal`} inputMode="decimal" defaultValue={numVal(track?.principalRemaining)} />
                    </Field>
                    <Field label={t("mortgage.annualRatePct")}>
                      <TextInput name={`track_${i}_rate`} inputMode="decimal" defaultValue={numVal(track?.annualRatePct)} />
                    </Field>
                    <Field label={t("mortgage.monthlyPayment")}>
                      <TextInput name={`track_${i}_payment`} inputMode="decimal" defaultValue={numVal(track?.monthlyPayment)} />
                    </Field>
                    <Field label={t("mortgage.endDate")}>
                      <TextInput name={`track_${i}_end`} type="date" defaultValue={dateVal(track?.endDate)} />
                    </Field>
                    <label className="flex items-center gap-1 pb-2 text-xs">
                      <input type="checkbox" name={`track_${i}_cpi`} defaultChecked={track?.cpiLinked ?? false} />
                      {t("mortgage.cpiLinked")}
                    </label>
                  </div>
                );
              })}
            </fieldset>
          </>
        ) : null}

        {item.kind === "CASH_FLOW" && cf ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("cashFlow.flowType")}>
              <Select name="flowType" defaultValue={cf.flowType}>
                {FLOW_TYPES.map((f) => <option key={f} value={f}>{t(`cashFlow.${f}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("cashFlow.amount")}>
              <TextInput name="amount" inputMode="decimal" defaultValue={numVal(cf.amount)} required />
            </Field>
            <Field label={t("cashFlow.frequency")}>
              <Select name="frequency" defaultValue={cf.frequency}>
                {(["MONTHLY", "ANNUAL", "ONE_TIME"] as const).map((f) => (
                  <option key={f} value={f}>{t(`cashFlow.${f}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("cashFlow.startDate")}>
              <TextInput name="startDate" type="date" defaultValue={dateVal(cf.startDate)} />
            </Field>
            <Field label={t("cashFlow.endDate")}>
              <TextInput name="endDate" type="date" defaultValue={dateVal(cf.endDate)} />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="isGross" defaultChecked={cf.isGross} />
              {t("cashFlow.isGross")}
            </label>
          </div>
        ) : null}

        {item.kind === "INSURANCE" && ins ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("insurance.policyType")}>
              <Select name="policyType" defaultValue={ins.policyType}>
                {POLICY_TYPES.map((p) => <option key={p} value={p}>{t(`insurance.${p}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("insurance.insuredMember")}>
              <Select name="insuredMemberId" defaultValue={ins.insuredMemberId ?? ""}>
                <option value=""></option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label={t("insurance.coverageAmount")}>
              <TextInput name="coverageAmount" inputMode="decimal" defaultValue={numVal(ins.coverageAmount)} />
            </Field>
            <Field label={t("insurance.monthlyPremium")}>
              <TextInput name="monthlyPremium" inputMode="decimal" defaultValue={numVal(ins.monthlyPremium)} />
            </Field>
            <Field label={t("insurance.endDate")}>
              <TextInput name="endDate" type="date" defaultValue={dateVal(ins.endDate)} />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="throughPension" defaultChecked={ins.throughPension} />
              {t("insurance.throughPension")}
            </label>
          </div>
        ) : null}

        {item.kind === "LOAN" && loan ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("loan.lenderName")}>
              <TextInput name="lenderName" defaultValue={loan.lenderName ?? ""} />
            </Field>
            <Field label={t("loan.principalRemaining")}>
              <TextInput name="principalRemaining" inputMode="decimal" defaultValue={numVal(loan.principalRemaining)} />
            </Field>
            <Field label={t("loan.annualRatePct")}>
              <TextInput name="annualRatePct" inputMode="decimal" defaultValue={numVal(loan.annualRatePct)} />
            </Field>
            <Field label={t("loan.endDate")}>
              <TextInput name="endDate" type="date" defaultValue={dateVal(loan.endDate)} />
            </Field>
            <Field label={t("loan.purpose")}>
              <TextInput name="purpose" defaultValue={loan.purpose ?? ""} />
            </Field>
          </div>
        ) : null}

        <Field label={t("notes")}>
          <TextInput name="notes" defaultValue={item.notes ?? ""} />
        </Field>

        <SubmitButton label={t("submit")} />
      </form>
    </Card>
  );
}
