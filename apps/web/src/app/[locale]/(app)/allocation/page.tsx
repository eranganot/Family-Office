import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { applyPresetAction, approveWorkingPlanAction, generatePlanAction, setCandidateAction } from "../../../../lib/actions/allocation-actions";
import { Card, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { Link } from "../../../../i18n/navigation";

/** M28 — allocation page: editable working plan + before→after impact panel. */

interface Candidate {
  id: string; kind: string; editable: boolean; minAmount: number; maxAmount: number;
  suggestedAmount: number; ratePct: number | null;
  detail: string; detailHe: string; goalImpact: string; goalImpactHe: string;
}
interface Variant {
  key: "GROWTH" | "DEBT_FREE" | "BALANCED";
  summary: { investedBase: number; debtRepaidBase: number; interestSavedYearBase: number; ceilingDepositsBase: number };
  pros: string[]; prosHe: string[]; cons: string[]; consHe: string[]; risks: string[]; risksHe: string[];
}
interface Plans {
  monthlyExpensesBase: number | null; bufferTargetBase: number | null;
  cashBase: number; freeCashBase: number; candidates: Candidate[]; variants: Variant[]; notes: string[];
}
interface ImpactShape {
  horizonYears: number; liquidCashBefore: number; liquidCashAfter: number;
  growthPctBefore: number | null; growthPctAfter: number | null; targetGrowthPct: number;
  totalDebtBefore: number; totalDebtAfter: number; annualInterestBefore: number; annualInterestAfter: number;
  taxCeilingsCaptured: number; goalGapBefore: number | null; goalGapAfter: number | null;
  projectedExtraNetWorth: number; extraFromInvesting: number; extraFromDebt: number; extraFromTax: number;
}
type WP = Record<string, { enabled: boolean; amount: number }>;
type T = (k: string, v?: Record<string, string | number>) => string;

export default async function AllocationPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = (await getTranslations("allocation")) as unknown as T & { has: (k: string) => boolean };
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;
  const l = locale as Locale;
  const he = locale === "he";
  const nis = (n: number) => formatMoney(String(n), "ILS", l);

  if (household.workflowState !== "ALLOCATION") {
    return (
      <Card title={t("title")}>
        <p className="mb-4 text-sm text-neutral-600">{t("wrongPhase")}</p>
        <Link href="/verification" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">{t("goToGate")}</Link>
      </Card>
    );
  }

  const latest = await trpc.allocation.latest();
  const plan = (latest?.plan ?? null) as Plans | null;
  const isV3 = !!plan && Array.isArray(plan.candidates);
  const wp = (latest?.workingPlan ?? {}) as WP;
  const proposed = latest?.status === "PROPOSED";
  const allocatedTotal = isV3 ? Object.values(wp).reduce((s, e) => s + (e.enabled ? e.amount : 0), 0) : 0;
  const remaining = isV3 ? plan!.freeCashBase - allocatedTotal : 0;
  const hasSelections = isV3 && Object.values(wp).some((e) => e.enabled && e.amount > 0);
  const impact = hasSelections ? ((await trpc.allocation.impact()) as ImpactShape | null) : null;

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        <p className="mb-3 text-sm text-neutral-600">{t("introV3")}</p>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t.has(`errors.${decodeURIComponent(error)}`) ? t(`errors.${decodeURIComponent(error)}`) : decodeURIComponent(error)}</p> : null}
        <form action={generatePlanAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">{latest ? t("regenerate") : t("generate")}</button>
        </form>
        {latest && !isV3 ? <p className="mt-3 text-sm text-amber-700">{t("legacyPlan")}</p> : null}
      </Card>

      {latest && isV3 && plan ? (
        <>
          <Card title={`${t("planTitle")} · ${new Date(latest.createdAt).toLocaleDateString(he ? "he-IL" : "en-GB")}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-medium ${latest.status === "APPROVED" ? "bg-green-50 text-green-700" : proposed ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>{t(`status.${latest.status}`)}</span>
              {latest.note === "AUTO_APPROVED_NOTHING_TO_DEPLOY" ? <span className="text-neutral-400">{t("autoApproved")}</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label={t("cash")} value={nis(plan.cashBase)} />
              <Stat label={t("bufferTarget")} value={plan.bufferTargetBase !== null ? nis(plan.bufferTargetBase) : "—"} />
              <Stat label={t("freeCash")} value={nis(plan.freeCashBase)} highlight={plan.freeCashBase > 0} />
              <Stat label={t("monthlyExpenses")} value={plan.monthlyExpensesBase !== null ? nis(plan.monthlyExpensesBase) : "—"} />
            </div>
            {plan.notes.includes("EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED") ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("expensesUnknown")}</p> : null}
          </Card>

          {proposed && plan.variants.length > 1 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {plan.variants.map((v) => (
                <div key={v.key} className={`flex flex-col rounded-xl border p-4 ${latest.chosenVariant === v.key ? "border-blue-500 ring-2 ring-blue-200" : "border-neutral-200"}`}>
                  <h3 className="mb-1 text-base font-semibold">{t(`variants.${v.key}.name`)}</h3>
                  <p className="mb-3 text-xs text-neutral-500">{t(`variants.${v.key}.tagline`)}</p>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                    <Stat label={t("sumInvested")} value={nis(v.summary.investedBase)} />
                    <Stat label={t("sumDebtRepaid")} value={nis(v.summary.debtRepaidBase)} />
                    <Stat label={t("sumInterestSaved")} value={`${nis(v.summary.interestSavedYearBase)}/${t("perYear")}`} />
                    <Stat label={t("sumCeilings")} value={nis(v.summary.ceilingDepositsBase)} />
                  </div>
                  <NList title={t("pros")} items={he ? v.prosHe : v.pros} tone="green" />
                  <NList title={t("cons")} items={he ? v.consHe : v.cons} tone="amber" />
                  <NList title={t("risks")} items={he ? v.risksHe : v.risks} tone="red" />
                  <form action={applyPresetAction} className="mt-auto pt-3">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={latest.id} />
                    <input type="hidden" name="variant" value={v.key} />
                    <button type="submit" className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${latest.chosenVariant === v.key ? "bg-blue-600 text-white" : "border border-blue-300 text-blue-700 hover:bg-blue-50"}`}>{t("usePreset")}</button>
                  </form>
                </div>
              ))}
            </div>
          ) : null}

          {Object.keys(wp).length > 0 ? (
            <Card title={t("workingTitle")}>
              <p className="mb-2 text-xs text-neutral-500">{t("workingHint")}</p>
              <div className={`mb-4 flex flex-wrap gap-4 rounded-lg px-3 py-2 text-sm ${remaining < -1 ? "bg-red-50 text-red-700" : "bg-neutral-50"}`}>
                <span>{t("allocated")}: <b>{nis(allocatedTotal)}</b></span>
                <span>{t("remaining")}: <b>{nis(Math.max(0, remaining))}</b></span>
                {remaining < -1 ? <span className="font-medium">{t("overAllocated")}</span> : null}
              </div>
              {impact ? <ImpactPanel im={impact} nis={nis} t={t} /> : null}
              {(["enabled", "available"] as const).map((group) => {
                const rows = plan.candidates.filter((c) => {
                  const on = (wp[c.id] ?? { enabled: c.kind === "TAX_VERIFY_PAYROLL" }).enabled;
                  return group === "enabled" ? on : !on;
                });
                if (rows.length === 0) return null;
                return (
                  <div key={group} className="mb-4">
                    <h4 className={`mb-2 text-sm font-semibold ${group === "enabled" ? "text-green-700" : "text-neutral-500"}`}>{group === "enabled" ? t("groupInPlan") : t("groupAvailable")}</h4>
                    <ul className="flex flex-col gap-2">
                      {rows.map((c) => {
                        const st = wp[c.id] ?? { enabled: c.kind === "TAX_VERIFY_PAYROLL", amount: c.suggestedAmount };
                        const on = st.enabled;
                        return (
                          <li key={c.id} className={`rounded-lg border p-3 ${on ? "border-green-200 bg-green-50/30" : "border-neutral-100"}`}>
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">{t(`kinds.${c.kind}`)}</span>
                              {c.ratePct !== null ? <span className="text-neutral-500">{c.ratePct}%</span> : null}
                              {c.kind !== "TAX_VERIFY_PAYROLL" ? <span className="text-neutral-400">{t("upTo")} {nis(c.maxAmount)}</span> : null}
                            </div>
                            <p className="text-sm text-neutral-700" dir="auto">{he ? c.detailHe : c.detail}</p>
                            <p className="mt-0.5 text-xs text-blue-700" dir="auto">◎ {he ? c.goalImpactHe : c.goalImpact}</p>
                            {proposed ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {c.editable ? (
                                  <form action={setCandidateAction} className="flex items-center gap-2">
                                    <input type="hidden" name="locale" value={locale} />
                                    <input type="hidden" name="id" value={latest.id} />
                                    <input type="hidden" name="candidateId" value={c.id} />
                                    <input type="hidden" name="enabled" value="1" />
                                    <TextInput name="amount" inputMode="numeric" defaultValue={String(on ? st.amount : c.suggestedAmount || Math.min(c.maxAmount, plan.freeCashBase))} />
                                    <button type="submit" className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white">{on ? t("update") : t("enable")}</button>
                                  </form>
                                ) : (
                                  <form action={setCandidateAction}>
                                    <input type="hidden" name="locale" value={locale} />
                                    <input type="hidden" name="id" value={latest.id} />
                                    <input type="hidden" name="candidateId" value={c.id} />
                                    <input type="hidden" name="enabled" value={on ? "0" : "1"} />
                                    <button type="submit" className={`rounded px-3 py-1.5 text-xs font-medium ${on ? "bg-green-600 text-white" : "border border-green-300 text-green-700"}`}>{on ? t("markDone") : t("confirm106")}</button>
                                  </form>
                                )}
                                {on && c.editable ? (
                                  <form action={setCandidateAction}>
                                    <input type="hidden" name="locale" value={locale} />
                                    <input type="hidden" name="id" value={latest.id} />
                                    <input type="hidden" name="candidateId" value={c.id} />
                                    <input type="hidden" name="enabled" value="0" />
                                    <input type="hidden" name="amount" value={String(st.amount)} />
                                    <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-500">{t("remove")}</button>
                                  </form>
                                ) : null}
                              </div>
                            ) : on ? <p className="mt-1 text-sm font-medium text-green-700">{c.kind === "TAX_VERIFY_PAYROLL" ? t("done") : nis(st.amount)}</p> : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {proposed ? (
                <form action={approveWorkingPlanAction} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={latest.id} />
                  <TextInput name="note" placeholder={t("approveNote")} />
                  <button type="submit" disabled={remaining < -1} className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${remaining < -1 ? "bg-neutral-300" : "bg-green-600"}`}>{t("approvePlan")}</button>
                </form>
              ) : <p className="mt-4 text-sm text-green-700">{t("approvedNext")}</p>}
            </Card>
          ) : proposed && plan.variants.length > 1 ? <p className="text-center text-sm text-neutral-500">{t("presetFirst")}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function ImpactPanel({ im, nis, t }: { im: ImpactShape; nis: (n: number) => string; t: T }) {
  const Row = ({ label, before, after, good }: { label: string; before: string; after: string; good?: boolean }) => (
    <div className="flex items-center justify-between border-b border-neutral-100 py-1.5 text-sm last:border-0">
      <span className="text-neutral-600">{label}</span>
      <span className="flex items-center gap-2"><span className="text-neutral-400">{before}</span><span className="text-neutral-300">→</span><span className={`font-medium ${good ? "text-green-700" : ""}`}>{after}</span></span>
    </div>
  );
  return (
    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="mb-2 text-sm font-semibold text-blue-800">{t("impactTitle")}</div>
      <Row label={t("impLiquidity")} before={nis(im.liquidCashBefore)} after={nis(im.liquidCashAfter)} />
      {im.growthPctBefore !== null && im.growthPctAfter !== null ? <Row label={t("impGrowth", { target: im.targetGrowthPct })} before={`${im.growthPctBefore}%`} after={`${im.growthPctAfter}%`} good /> : null}
      {im.totalDebtBefore > 0 ? <Row label={t("impDebt")} before={nis(im.totalDebtBefore)} after={nis(im.totalDebtAfter)} good={im.totalDebtAfter < im.totalDebtBefore} /> : null}
      {im.annualInterestBefore > 0 ? <Row label={t("impInterest")} before={`${nis(im.annualInterestBefore)}/${t("perYearShort")}`} after={`${nis(im.annualInterestAfter)}/${t("perYearShort")}`} good={im.annualInterestAfter < im.annualInterestBefore} /> : null}
      {im.taxCeilingsCaptured > 0 ? <Row label={t("impTax")} before={nis(0)} after={nis(im.taxCeilingsCaptured)} good /> : null}
      {im.goalGapBefore !== null ? <Row label={t("impGoalGap")} before={nis(im.goalGapBefore)} after={nis(im.goalGapAfter ?? im.goalGapBefore)} /> : null}
      <div className="mt-3 rounded-lg bg-white/70 px-3 py-2">
        <div className="text-xs text-neutral-500">{t("impProjectionLabel", { years: im.horizonYears })}</div>
        <div className="text-lg font-bold text-green-700">+{nis(im.projectedExtraNetWorth)}</div>
        <div className="mt-1 text-xs text-neutral-500">
          {im.extraFromInvesting > 0 ? `${t("impFromInvest")}: +${nis(im.extraFromInvesting)}  ` : ""}
          {im.extraFromDebt > 0 ? `${t("impFromDebt")}: +${nis(im.extraFromDebt)}  ` : ""}
          {im.extraFromTax > 0 ? `${t("impFromTax")}: +${nis(im.extraFromTax)}` : ""}
        </div>
        <div className="mt-1 text-xs text-neutral-400">{t("impNote")}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div><div className="text-xs text-neutral-400">{label}</div><div className={`font-medium ${highlight ? "text-blue-700" : ""}`}>{value}</div></div>;
}
function NList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" | "red" }) {
  if (items.length === 0) return null;
  const c = tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "text-red-700";
  return <div className="mb-2"><div className={`mb-0.5 text-xs font-semibold ${c}`}>{title}</div><ul className="list-inside list-disc text-xs text-neutral-600">{items.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></div>;
}
