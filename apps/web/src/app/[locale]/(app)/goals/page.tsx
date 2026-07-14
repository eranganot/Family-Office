import { formatDate, formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { createGoalAction, setGoalStatusAction, updateGoalAction } from "../../../../lib/actions/goal-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput, SuccessBanner } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

const GOAL_TYPES = [
  "EMERGENCY_FUND", "RETIREMENT", "CHILDREN_EDUCATION", "PROPERTY_PURCHASE", "INVESTMENT_PROPERTY",
  "FINANCIAL_INDEPENDENCE", "LIFESTYLE", "LEGACY", "INHERITANCE", "PHILANTHROPY", "OTHER",
] as const;

export default async function GoalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { locale } = await params;
  const { error, ok } = await searchParams;
  const t = await getTranslations("goals");
  const tok = await getTranslations("ok");
  const tf = await getTranslations("forms");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;
  const goals = await trpc.goals.list();
  const gap = await trpc.goals.fundingGap();
  const gapByGoal = new Map(gap.results.map((r) => [r.goalId, r]));
  const l = locale as Locale;

  return (
    <div className="flex flex-col gap-6">
      <SuccessBanner message={ok && ["goalCreated","goalSaved","goalStatus"].includes(ok) ? tok(ok) : undefined} />
      <Card title={t("gapReport")}>
        <p className="mb-3 text-xs text-neutral-500">
          {t("gapHint")}: {gap.realReturnPctUsed}%.
          {gap.excludedUnverifiedCount > 0 ? ` (${gap.excludedUnverifiedCount} ${t("excludedUnverified")})` : ""}
        </p>
        <div className="flex gap-6 text-sm">
          <span>
            {t("pools")}: {t("liquid")}{" "}
            <span className="font-medium">{formatMoney(gap.pools.liquidILS, "ILS", l)}</span>
          </span>
          <span>
            {t("retirementPool")}{" "}
            <span className="font-medium">{formatMoney(gap.pools.retirementILS, "ILS", l)}</span>
          </span>
        </div>
      </Card>

      <Card title={`${t("title")} (${goals.length})`}>
        <ErrorBanner message={error ? `${tf("error")}: ${decodeURIComponent(error)}` : undefined} />
        {goals.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <div>
              <p className="text-base font-semibold text-neutral-900">{t("emptyTitle")}</p>
              <p className="mt-1 text-sm text-neutral-600" dir="auto">{t("emptyHint")}</p>
            </div>
            <a href="#goal-add" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
              {t("emptyCta")}
            </a>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {goals.map((g) => {
              const r = gapByGoal.get(g.id);
              return (
                <li key={g.id} className="rounded-lg border border-neutral-100 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">#{g.priority}</span>
                      <span className="ms-2 text-sm font-medium">{g.name}</span>
                      <span className="ms-2 text-xs text-neutral-400">
                        {t(`types.${g.type}`)}
                        {g.targetDate ? ` · ${formatDate(g.targetDate, l)}` : ""}
                        {g.targetMonthlyIncome ? ` · ${t("incomeModeBadge")}: ${formatMoney(String(g.targetMonthlyIncome), "ILS", l)}/${t("perMonth")}` : ""}
                        {g.dependsOn.length > 0 ? ` · ${t("dependsOn")}: ${g.dependsOn.map((d) => d.dependsOnGoal.name).join(", ")}` : ""}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {(["ACHIEVED", "ABANDONED"] as const).map((s) => (
                        <form key={s} action={setGoalStatusAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="id" value={g.id} />
                          <input type="hidden" name="status" value={s} />
                          <button type="submit" className="text-xs text-neutral-400 underline">
                            {s === "ACHIEVED" ? t("achieve") : t("abandon")}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                  {r ? (
                    r.computable ? (
                      <div className="grid grid-cols-5 gap-3 text-sm">
                        <Stat label={t("required")} value={formatMoney(r.requiredILS!, "ILS", l)} />
                        <Stat label={t("allocated")} value={formatMoney(r.allocatedNowILS!, "ILS", l)} />
                        {Number(r.earmarkedNowILS ?? 0) > 0 ? (
                          <Stat label={t("earmarked")} value={formatMoney(r.earmarkedNowILS!, "ILS", l)} />
                        ) : null}
                        <Stat label={`${t("projected")} (${r.yearsToTarget} ${t("years")})`} value={formatMoney(r.projectedValueILS!, "ILS", l)} />
                        <Stat label={t("gap")} value={formatMoney(r.gapILS!, "ILS", l)} highlight={Number(r.gapILS) > 0} />
                        <Stat label={t("monthlySaving")} value={formatMoney(r.requiredMonthlySavingILS!, "ILS", l)} highlight={Number(r.requiredMonthlySavingILS) > 0} />
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">{t(`notComputable.${r.reason}`)}</p>
                    )
                  ) : null}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-blue-600 underline">{tf("edit")}</summary>
                    <form action={updateGoalAction} className="mt-3 grid max-w-2xl grid-cols-2 gap-3 rounded-lg bg-neutral-50 p-3">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={g.id} />
                      <Field label={t("name")}>
                        <TextInput name="name" defaultValue={g.name} required />
                      </Field>
                      <Field label={t("type")}>
                        <Select name="type" defaultValue={g.type}>
                          {GOAL_TYPES.map((gt) => <option key={gt} value={gt}>{t(`types.${gt}`)}</option>)}
                        </Select>
                      </Field>
                      <Field label={t("priority")}>
                        <TextInput name="priority" type="number" min={1} max={99} defaultValue={g.priority} />
                      </Field>
                      <Field label={t("targetDate")}>
                        <TextInput name="targetDate" type="date" defaultValue={g.targetDate ? new Date(g.targetDate).toISOString().slice(0, 10) : ""} />
                      </Field>
                      <Field label={`${t("requiredFunding")} (${household.baseCurrency})`}>
                        <TextInput name="requiredFunding" inputMode="decimal" defaultValue={g.requiredFunding ? String(g.requiredFunding) : ""} />
                      </Field>
                      {g.type === "FINANCIAL_INDEPENDENCE" || g.type === "RETIREMENT" ? (
                        <Field label={`${t("targetMonthlyIncome")} (${household.baseCurrency})`}>
                          <TextInput name="targetMonthlyIncome" inputMode="decimal" defaultValue={g.targetMonthlyIncome ? String(g.targetMonthlyIncome) : ""} />
                        </Field>
                      ) : null}
                      <Field label={t("riskTolerance")}>
                        <Select name="riskTolerance" defaultValue={g.riskTolerance}>
                          {(["LOW", "MEDIUM", "HIGH"] as const).map((rt) => <option key={rt} value={rt}>{t(rt)}</option>)}
                        </Select>
                      </Field>
                      {goals.length > 1 ? (
                        <Field label={t("dependsOn")}>
                          <Select name="dependsOn" multiple defaultValue={g.dependsOn.map((dep) => dep.dependsOnGoal.id)}>
                            {goals.filter((o) => o.id !== g.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </Select>
                        </Field>
                      ) : null}
                      <div className="col-span-2">
                        <SubmitButton label={tf("submit")} />
                      </div>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div id="goal-add" />
      <Card title={t("add")}>
        <form action={createGoalAction} className="grid max-w-2xl grid-cols-2 gap-3">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("name")}>
            <TextInput name="name" required />
          </Field>
          <Field label={t("type")}>
            <Select name="type">
              {GOAL_TYPES.map((g) => <option key={g} value={g}>{t(`types.${g}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("priority")}>
            <TextInput name="priority" type="number" min={1} max={99} defaultValue={5} />
          </Field>
          <Field label={t("targetDate")}>
            <TextInput name="targetDate" type="date" />
          </Field>
          <Field label={`${t("requiredFunding")} (${household.baseCurrency})`}>
            <TextInput name="requiredFunding" inputMode="decimal" />
          </Field>
          <Field label={`${t("targetMonthlyIncome")} (${household.baseCurrency})`}>
            <TextInput name="targetMonthlyIncome" inputMode="decimal" placeholder={t("incomeModeHint")} />
          </Field>
          <Field label={t("riskTolerance")}>
            <Select name="riskTolerance" defaultValue="MEDIUM">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((rt) => <option key={rt} value={rt}>{t(rt)}</option>)}
            </Select>
          </Field>
          {goals.length > 0 ? (
            <Field label={t("dependsOn")}>
              <Select name="dependsOn" multiple>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
          ) : null}
          <div className="col-span-2">
            <SubmitButton label={t("add")} />
          </div>
        </form>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className={`font-medium ${highlight ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}
