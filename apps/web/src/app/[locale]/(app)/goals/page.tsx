import { formatDate, formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { createGoalAction, setGoalStatusAction } from "../../../../lib/actions/goal-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../components/fields";
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
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("goals");
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
          <p className="text-sm text-neutral-500">{t("empty")}</p>
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
                        <Stat label={`${t("projected")} (${r.yearsToTarget} ${t("years")})`} value={formatMoney(r.projectedValueILS!, "ILS", l)} />
                        <Stat label={t("gap")} value={formatMoney(r.gapILS!, "ILS", l)} highlight={Number(r.gapILS) > 0} />
                        <Stat label={t("monthlySaving")} value={formatMoney(r.requiredMonthlySavingILS!, "ILS", l)} highlight={Number(r.requiredMonthlySavingILS) > 0} />
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">{t(`notComputable.${r.reason}`)}</p>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

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
