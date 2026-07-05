import { formatDate, formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { runScenarioAction } from "../../../../lib/actions/scenario-actions";
import { Card, Field, Select, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { Link } from "../../../../i18n/navigation";

const TYPES = [
  "RETIRE_EARLIER", "RETIRE_LATER", "JOB_LOSS", "MARKET_CRASH",
  "HIGH_INFLATION", "MORTGAGE_REFINANCE", "SAVINGS_RATE_UP", "SAVINGS_RATE_DOWN",
] as const;

interface ProjRows { rows: Array<{ year: number; netWorth: number; investable: number }>; terminalNetWorth: number; minInvestable: number; yearsToDepletion: number | null; goalOutcomes: Array<{ goalId: string; name: string; targetYear: number | null; funded: boolean | null }>; }
interface ResultShape { baseline: ProjRows; scenario: ProjRows; years: number; }

export default async function ScenariosPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; view?: string }>;
}) {
  const { locale } = await params;
  const { error, view } = await searchParams;
  const t = await getTranslations("scenarios");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;
  const l = locale as Locale;

  if (household.workflowState !== "STRATEGY") {
    return (
      <Card title={t("title")}>
        <p className="mb-4 text-sm text-neutral-600">{t("wrongPhase")}</p>
        <Link href="/verification" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          {t("title")} → {t("wrongPhase").split(".")[0]}
        </Link>
      </Card>
    );
  }

  const saved = await trpc.scenarios.list();
  const selected = view ? await trpc.scenarios.get({ id: view }) : null;
  const result = selected?.resultSnapshot as unknown as ResultShape | null;
  const milestoneYears = result
    ? [0, 4, 9, result.baseline.rows.length - 1].filter((i, n, a) => i >= 0 && a.indexOf(i) === n && i < result.baseline.rows.length)
    : [];
  const nis = (n: number) => formatMoney(String(n), "ILS", l);

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{decodeURIComponent(error)}</p> : null}
        <p className="mb-4 text-xs text-neutral-500">{t("hint")}</p>
        <form action={runScenarioAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("type")}>
            <Select name="type">
              {TYPES.map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("years")}>
            <TextInput name="years" type="number" min={5} max={50} defaultValue={20} />
          </Field>
          <SubmitButton label={t("run")} />
        </form>
      </Card>

      {selected && result ? (
        <Card title={`${selected.name} · ${formatDate(selected.createdAt, l)}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-400">
                <th className="pb-2 text-start"></th>
                {milestoneYears.map((i) => (
                  <th key={i} className="pb-2 text-start">{t("netWorthAt")} {result.baseline.rows[i]!.year}</th>
                ))}
                <th className="pb-2 text-start">{t("minInvestable")}</th>
                <th className="pb-2 text-start">{t("depletion")}</th>
              </tr>
            </thead>
            <tbody>
              {(["baseline", "scenario"] as const).map((k) => (
                <tr key={k} className="border-t border-neutral-100">
                  <td className="py-2 font-medium">{t(k)}</td>
                  {milestoneYears.map((i) => (
                    <td key={i} className="py-2">{nis(result[k].rows[i]!.netWorth)}</td>
                  ))}
                  <td className="py-2">{nis(result[k].minInvestable)}</td>
                  <td className="py-2">{result[k].yearsToDepletion ?? t("never")}</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-200 text-xs text-neutral-500">
                <td className="py-2">Δ</td>
                {milestoneYears.map((i) => {
                  const d = result.scenario.rows[i]!.netWorth - result.baseline.rows[i]!.netWorth;
                  return (
                    <td key={i} className={`py-2 ${d < 0 ? "text-red-600" : "text-green-600"}`}>
                      {d >= 0 ? "+" : ""}{nis(d)}
                    </td>
                  );
                })}
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>

          {result.baseline.goalOutcomes.length > 0 ? (
            <div className="mt-4">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">{t("goalOutcomes")}</div>
              <ul className="flex flex-col gap-1 text-sm">
                {result.baseline.goalOutcomes.map((g, i) => {
                  const s = result.scenario.goalOutcomes[i];
                  const badge = (funded: boolean | null) =>
                    funded === null ? t("notComputable") : funded ? t("funded") : t("notFunded");
                  const cls = (funded: boolean | null) =>
                    funded === null ? "text-neutral-400" : funded ? "text-green-600" : "text-red-600";
                  return (
                    <li key={g.goalId} className="flex justify-between">
                      <span>{g.name}{g.targetYear ? ` (${g.targetYear})` : ""}</span>
                      <span>
                        {t("baseline")}: <span className={cls(g.funded)}>{badge(g.funded)}</span>
                        {" · "}
                        {t("scenario")}: <span className={cls(s?.funded ?? null)}>{badge(s?.funded ?? null)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card title={t("saved")}>
        <ul className="flex flex-col gap-1 text-sm">
          {saved.map((s) => (
            <li key={s.id}>
              <a href={`/${locale}/scenarios?view=${s.id}`} className="underline">
                {s.name}
              </a>{" "}
              <span className="text-xs text-neutral-400">{formatDate(s.createdAt, l)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
