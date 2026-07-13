import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  createAccountAction,
  createCashFlowAction,
  createInsuranceAction,
  createLoanAction,
  createMortgageAction,
  createOtherAction,
  createRealEstateAction,
} from "../../../../../../lib/actions/mapping-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../../../components/fields";
import { OwnershipFields } from "../../../../../../components/ownership-fields";
import { ValuationFields } from "../../../../../../components/valuation-fields";
import { serverCaller } from "../../../../../../lib/trpc-server";

const CURRENCIES = ["ILS", "USD", "EUR"] as const;
const ACCOUNT_TYPES = [
  "BANK_CHECKING", "BANK_SAVINGS", "BANK_DEPOSIT", "BROKERAGE_IL", "BROKERAGE_FOREIGN",
  "PENSION_COMPREHENSIVE", "PENSION_GENERAL", "KUPAT_GEMEL", "GEMEL_LEHASHKAA",
  "KEREN_HISHTALMUT", "IRA_GEMEL", "FOREIGN_RETIREMENT", "CASH_OTHER",
] as const;
const TRACK_TYPES = ["PRIME", "FIXED_LINKED", "FIXED_UNLINKED", "VARIABLE_LINKED", "VARIABLE_UNLINKED", "FOREIGN_CURRENCY"] as const;
const FLOW_TYPES = [
  "SALARY", "SELF_EMPLOYMENT_INCOME", "RENTAL_INCOME", "PENSION_INCOME", "OTHER_INCOME",
  "LIVING_EXPENSE", "HOUSING_EXPENSE", "EDUCATION_EXPENSE", "INSURANCE_PREMIUM", "LOAN_PAYMENT", "OTHER_EXPENSE",
] as const;
const POLICY_TYPES = ["LIFE", "DISABILITY", "HEALTH", "LONG_TERM_CARE", "PROPERTY", "MORTGAGE_LIFE", "OTHER"] as const;

const VALID_KINDS = ["account", "real-estate", "mortgage", "cash-flow", "insurance", "loan", "other-asset", "other-liability"] as const;
type FormKind = (typeof VALID_KINDS)[number];

export default async function NewItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; kind: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale, kind } = await params;
  const { error } = await searchParams;
  if (!VALID_KINDS.includes(kind as FormKind)) notFound();
  const formKind = kind as FormKind;

  const t = await getTranslations("forms");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  const members = (household?.members ?? []).map((m) => ({ id: m.id, name: m.name }));
  const properties =
    formKind === "mortgage" && household ? await trpc.ledger.list({ kind: "REAL_ESTATE" }) : [];

  const titles: Record<FormKind, string> = {
    account: t("account.title"),
    "real-estate": t("realEstate.title"),
    mortgage: t("mortgage.title"),
    "cash-flow": t("cashFlow.title"),
    insurance: t("insurance.title"),
    loan: t("loan.title"),
    "other-asset": t("other.titleAsset"),
    "other-liability": t("other.titleLiability"),
  };
  const actions: Record<FormKind, (fd: FormData) => Promise<void>> = {
    account: createAccountAction,
    "real-estate": createRealEstateAction,
    mortgage: createMortgageAction,
    "cash-flow": createCashFlowAction,
    insurance: createInsuranceAction,
    loan: createLoanAction,
    "other-asset": createOtherAction,
    "other-liability": createOtherAction,
  };

  return (
    <Card title={titles[formKind]}>
      <ErrorBanner message={error ? `${t("error")}: ${decodeURIComponent(error)}` : undefined} />
      <form action={actions[formKind]} className="flex max-w-2xl flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        {formKind === "other-asset" || formKind === "other-liability" ? (
          <input type="hidden" name="kind" value={formKind === "other-asset" ? "OTHER_ASSET" : "OTHER_LIABILITY"} />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("name")}>
            <TextInput name="name" required />
          </Field>
          <Field label={t("currency")}>
            <Select name="currency" defaultValue="ILS">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>

        {formKind === "account" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("account.accountType")}>
              <Select name="accountType">
                {ACCOUNT_TYPES.map((a) => <option key={a} value={a}>{t(`accountTypes.${a}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("account.institution")}>
              <TextInput name="institutionName" required />
            </Field>
            <Field label={t("account.accountNumberMasked")}>
              <TextInput name="accountNumberMasked" placeholder="****1234" />
            </Field>
            <Field label={t("account.trackName")}>
              <TextInput name="trackName" />
            </Field>
            <Field label={t("account.managementFeePct")}>
              <TextInput name="managementFeePct" inputMode="decimal" placeholder="0.5" />
            </Field>
            <Field label={t("account.depositFeePct")}>
              <TextInput name="depositFeePct" inputMode="decimal" placeholder="1.5" />
            </Field>
            <Field label={t("account.growthSharePct")}>
              <TextInput name="growthSharePct" inputMode="decimal" placeholder="60" />
            </Field>
            <Field label={t("account.employerName")}>
              <TextInput name="employerName" />
            </Field>
            <Field label={t("account.openedAt")}>
              <TextInput name="openedAt" type="date" />
            </Field>
            <Field label={t("account.liquidityClass")}>
              <Select name="liquidityClass" defaultValue="">
                <option value=""></option>
                {(["LIQUID", "RESTRICTED", "LOCKED"] as const).map((l) => (
                  <option key={l} value={l}>{t(`account.${l}`)}</option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        {formKind === "real-estate" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("realEstate.address")}>
              <TextInput name="address" required />
            </Field>
            <Field label={t("realEstate.city")}>
              <TextInput name="city" />
            </Field>
            <Field label={t("realEstate.propertyType")}>
              <Select name="propertyType">
                {(["APARTMENT", "HOUSE", "LOT", "COMMERCIAL"] as const).map((p) => (
                  <option key={p} value={p}>{t(`realEstate.${p}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("realEstate.purchaseDate")}>
              <TextInput name="purchaseDate" type="date" />
            </Field>
            <Field label={t("realEstate.purchasePrice")}>
              <TextInput name="purchasePrice" inputMode="decimal" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPrimaryResidence" />
              {t("realEstate.isPrimaryResidence")}
            </label>
          </div>
        ) : null}

        {formKind === "mortgage" ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("mortgage.lenderName")}>
                <TextInput name="lenderName" />
              </Field>
              <Field label={t("mortgage.linkedProperty")}>
                <Select name="linkedPropertyId" defaultValue="">
                  <option value="">{t("mortgage.none")}</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label={t("mortgage.startDate")}>
                <TextInput name="startDate" type="date" required />
              </Field>
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm text-neutral-600">{t("mortgage.tracks")}</legend>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-6 items-end gap-2 rounded-lg border border-neutral-100 p-2">
                  <Field label={`${t("mortgage.track")} ${i + 1}`}>
                    <Select name={`track_${i}_type`}>
                      {TRACK_TYPES.map((tt) => <option key={tt} value={tt}>{t(`mortgage.${tt}`)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("mortgage.principalRemaining")}>
                    <TextInput name={`track_${i}_principal`} inputMode="decimal" />
                  </Field>
                  <Field label={t("mortgage.annualRatePct")}>
                    <TextInput name={`track_${i}_rate`} inputMode="decimal" />
                  </Field>
                  <Field label={t("mortgage.monthlyPayment")}>
                    <TextInput name={`track_${i}_payment`} inputMode="decimal" />
                  </Field>
                  <Field label={t("mortgage.endDate")}>
                    <TextInput name={`track_${i}_end`} type="date" />
                  </Field>
                  <label className="flex items-center gap-1 pb-2 text-xs">
                    <input type="checkbox" name={`track_${i}_cpi`} />
                    {t("mortgage.cpiLinked")}
                  </label>
                </div>
              ))}
            </fieldset>
          </>
        ) : null}

        {formKind === "cash-flow" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("cashFlow.flowType")}>
              <Select name="flowType">
                {FLOW_TYPES.map((f) => <option key={f} value={f}>{t(`cashFlow.${f}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("cashFlow.amount")}>
              <TextInput name="amount" inputMode="decimal" required />
            </Field>
            <Field label={t("cashFlow.frequency")}>
              <Select name="frequency">
                {(["MONTHLY", "ANNUAL", "ONE_TIME"] as const).map((f) => (
                  <option key={f} value={f}>{t(`cashFlow.${f}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("cashFlow.startDate")}>
              <TextInput name="startDate" type="date" required />
            </Field>
            <Field label={t("cashFlow.endDate")}>
              <TextInput name="endDate" type="date" />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="isGross" defaultChecked />
              {t("cashFlow.isGross")}
            </label>
          </div>
        ) : null}

        {formKind === "insurance" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("insurance.policyType")}>
              <Select name="policyType">
                {POLICY_TYPES.map((p) => <option key={p} value={p}>{t(`insurance.${p}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("insurance.insuredMember")}>
              <Select name="insuredMemberId" defaultValue="">
                <option value=""></option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label={t("insurance.coverageAmount")}>
              <TextInput name="coverageAmount" inputMode="decimal" />
            </Field>
            <Field label={t("insurance.monthlyPremium")}>
              <TextInput name="monthlyPremium" inputMode="decimal" />
            </Field>
            <Field label={t("insurance.endDate")}>
              <TextInput name="endDate" type="date" />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="throughPension" />
              {t("insurance.throughPension")}
            </label>
          </div>
        ) : null}

        {formKind === "loan" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("loan.lenderName")}>
              <TextInput name="lenderName" />
            </Field>
            <Field label={t("loan.principalRemaining")}>
              <TextInput name="principalRemaining" inputMode="decimal" required />
            </Field>
            <Field label={t("loan.annualRatePct")}>
              <TextInput name="annualRatePct" inputMode="decimal" />
            </Field>
            <Field label={t("loan.endDate")}>
              <TextInput name="endDate" type="date" />
            </Field>
            <Field label={t("loan.purpose")}>
              <TextInput name="purpose" />
            </Field>
          </div>
        ) : null}

        <OwnershipFields members={members} />

        {formKind === "account" || formKind === "real-estate" || formKind === "other-asset" || formKind === "other-liability" ? (
          <ValuationFields />
        ) : null}

        <Field label={t("notes")}>
          <TextInput name="notes" />
        </Field>

        <SubmitButton label={t("submit")} />
      </form>
    </Card>
  );
}
