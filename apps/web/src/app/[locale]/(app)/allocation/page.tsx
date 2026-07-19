import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { chooseVariantAction, decideStepAction, generatePlanAction } from "../../../../lib/actions/allocation-actions";
import { Card } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { Link } from "../../../../i18n/navigation";

/** M26 — variantized ALLOCATION page: pick a philosophy, then decide every step. */

interface StepShape {
  id: string; kind: string; amountBase: number;
  detail: string; detailHe: string; goalImpact: string; goalImpactHe: string;
}
interface VariantShape {
  key: "GROWTH" | "DEBT_FREE" | "BALANCED";
  steps: StepShape[]; leftoverBase: number;
  summary: { investedBase: number; debtRepaidBase: number; interestSavedYearBase: number; ceilingDepositsBase: number };
  pros: string[]; prosHe: string[]; cons: string[]; consHe: string[]; risks: string[]; risksHe: string[];
}
interface PlansShape {
  monthlyExpensesBase: number | null; bufferTargetBase: number | null;
  cashBase: number; freeCashBase: number; variants: VariantShape[]; notes: string[];
}

export default async function AllocationPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("allocation");
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
  const plan = (latest?.plan ?? null) as PlansShape | null;
  const isV2 = !!plan && Array.isArray(plan.variants);
  const chosenKey = (latest?.chosenVariant ?? null) as VariantShape["key"] | null;
  const chosen = isV2 && chosenKey ? plan!.variants.find((v) => v.key === chosenKey) ?? null : null;
  const decisions = (latest?.stepDecisions ?? {}) as Record<string, "APPROVED" | "DECLINED">;

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        <p className="mb-3 text-sm text-neutral-600">{t("introV2")}</p>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{decodeURIComponent(error)}</p> : null}
        <form action={generatePlanAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            {latest ? t("regenerate") : t("generate")}
          </button>
        </form>
        {latest && !isV2 ? <p className="mt-3 text-sm text-amber-700">{t("legacyPlan")}</p> : null}
      </Card>

      {latest && isV2 && plan ? (
        <>
          <Card title={`${t("planTitle")} · ${new Date(latest.createdAt).toLocaleDateString(he ? "he-IL" : "en-GB")}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-medium ${latest.status === "APPROVED" ? "bg-green-50 text-green-700" : latest.status === "PROPOSED" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>
                {t(`status.${latest.status}`)}
              </span>
              {latest.note === "AUTO_APPROVED_NOTHING_TO_DEPLOY" ? <span className="text-neutral-400">{t("autoApproved")}</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label={t("cash")} value={nis(plan.cashBase)} />
              <Stat label={t("bufferTarget")} value={plan.bufferTargetBase !== null ? nis(plan.bufferTargetBase) : "—"} />
              <Stat label={t("freeCash")} value={nis(plan.freeCashBase)} highlight={plan.freeCashBase > 0} />
              <Stat label={t("monthlyExpenses")} value={plan.monthlyExpensesBase !== null ? nis(plan.monthlyExpensesBase) : "—"} />
            </div>
            {plan.notes.includes("EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED") ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("expensesUnknown")}</p>
            ) : null}
          </Card>

          {latest.status === "PROPOSED" && plan.variants.length > 1 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {plan.variants.map((v) => {
                const active = chosenKey === v.key;
                return (
                  <div key={v.key} className={`flex flex-col rounded-xl border p-4 ${active ? "border-blue-500 ring-2 ring-blue-200" : "border-neutral-200"}`}>
                    <h3 className="mb-1 text-base font-semibold">{t(`variants.${v.key}.name`)}</h3>
                    <p className="mb-3 text-xs text-neutral-500">{t(`variants.${v.key}.tagline`)}</p>
                    <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                      <Stat label={t("sumInvested")} value={nis(v.summary.investedBase)} />
                      <Stat label={t("sumDebtRepaid")} value={nis(v.summary.debtRepaidBase)} />
                      <Stat label={t("sumInterestSaved")} value={`${nis(v.summary.interestSavedYearBase)}/${t("perYear")}`} />
                      <Stat label={t("sumCeilings")} value={nis(v.summary.ceilingDepositsBase)} />
                    </div>
                    <NarrativeList title={t("pros")} items={he ? v.prosHe : v.pros} tone="green" />
                    <NarrativeList title={t("cons")} items={he ? v.consHe : v.cons} tone="amber" />
                    <NarrativeList title={t("risks")} items={he ? v.risksHe : v.risks} tone="red" />
                    <form action={chooseVariantAction} className="mt-auto pt-3">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={latest.id} />
                      <input type="hidden" name="variant" value={v.key} />
                      <button type="submit" className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-blue-600 text-white" : "border border-blue-300 text-blue-700 hover:bg-blue-50"}`}>
                        {active ? t("chosen") : t("choose")}
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          ) : null}

          {chosen ? (
            <Card title={`${t("stepsTitle")} — ${t(`variants.${chosen.key}.name`)}`}>
              <p className="mb-3 text-xs text-neutral-500">{t("stepsHint")}</p>
              <ol className="flex flex-col gap-2">
                {chosen.steps.map((s, i) => {
                  const d = decisions[s.id];
                  return (
                    <li key={s.id} className={`flex items-start gap-3 rounded-lg border p-3 ${d === "APPROVED" ? "border-green-200 bg-green-50/40" : d === "DECLINED" ? "border-neutral-200 bg-neutral-50 opacity-70" : "border-neutral-100"}`}>
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
                      <div className="grow">
                        <div className="mb-0.5 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">{t(`kinds.${s.kind}`)}</span>
                          {s.amountBase > 0 ? <span className="font-semibold">{nis(s.amountBase)}</span> : null}
                          {d ? (
                            <span className={`rounded-full px-2 py-0.5 font-medium ${d === "APPROVED" ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>
                              {d === "APPROVED" ? t("stepApproved") : t("stepDeclined")}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-neutral-700" dir="auto">{he ? s.detailHe : s.detail}</p>
                        <p className="mt-0.5 text-xs text-blue-700" dir="auto">◎ {he ? s.goalImpactHe : s.goalImpact}</p>
                      </div>
                      {latest.status === "PROPOSED" ? (
                        <div className="flex shrink-0 flex-col gap-1">
                          {(["APPROVED", "DECLINED"] as const).map((decision) => (
                            <form key={decision} action={decideStepAction}>
                              <input type="hidden" name="locale" value={locale} />
                              <input type="hidden" name="id" value={latest.id} />
                              <input type="hidden" name="stepId" value={s.id} />
                              <input type="hidden" name="decision" value={decision} />
                              <button
                                type="submit"
                                className={
                                  decision === "APPROVED"
                                    ? `rounded px-2.5 py-1 text-xs font-medium ${d === "APPROVED" ? "bg-green-600 text-white" : "border border-green-300 text-green-700"}`
                                    : `rounded px-2.5 py-1 text-xs font-medium ${d === "DECLINED" ? "bg-neutral-500 text-white" : "border border-neutral-300 text-neutral-500"}`
                                }
                              >
                                {decision === "APPROVED" ? t("approveStep") : t("declineStep")}
                              </button>
                            </form>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {latest.status === "PROPOSED" ? (
                <p className="mt-3 text-xs text-neutral-500">
                  {t("progress", { decided: chosen.steps.filter((s) => decisions[s.id]).length, total: chosen.steps.length })}
                </p>
              ) : (
                <p className="mt-3 text-sm text-green-700">{t("approvedNext")}</p>
              )}
            </Card>
          ) : latest.status === "PROPOSED" && plan.variants.length > 1 ? (
            <p className="text-center text-sm text-neutral-500">{t("chooseFirst")}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className={`font-medium ${highlight ? "text-blue-700" : ""}`}>{value}</div>
    </div>
  );
}

function NarrativeList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" | "red" }) {
  if (items.length === 0) return null;
  const color = tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "text-red-700";
  return (
    <div className="mb-2">
      <div className={`mb-0.5 text-xs font-semibold ${color}`}>{title}</div>
      <ul className="list-inside list-disc text-xs text-neutral-600">
        {items.map((x, i) => <li key={i} dir="auto">{x}</li>)}
      </ul>
    </div>
  );
}
