import { getTranslations } from "next-intl/server";
import { deriveTargetGrowthPct } from "@wealthos/engine-strategy";
import { decideAction, runStrategyAction, saveRiskAction } from "../../../../lib/actions/strategy-actions";
import { Card, Field, Select, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { Link } from "../../../../i18n/navigation";

interface RationaleShape {
  why: string;
  benefits: string[];
  risks: string[];
  tradeoffs: string[];
  taxImplications: string;
  liquidityImplications: string;
  timeHorizon: string;
  sensitivity: string;
  alternatives: string[];
  expectedImpact: string;
}

export default async function StrategyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; ran?: string; created?: string; superseded?: string; gap?: string; savedRisk?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations("strategy");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;

  if (household.workflowState !== "STRATEGY") {
    return (
      <Card title={t("title")}>
        <p className="mb-4 text-sm text-neutral-600">{t("wrongPhase")}</p>
        <Link href="/verification" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          {t("goToVerification")}
        </Link>
      </Card>
    );
  }

  const recommendations = await trpc.strategy.recommendations();
  const assumptions = await trpc.registry.assumptions();
  const aVal = (key: string, fallback: number) => {
    const row = assumptions.find((a) => a.key === key);
    return row ? Number(row.value) : fallback;
  };
  const risk = {
    lossTolerance: aVal("risk_loss_tolerance", 2),
    incomeStability: aVal("risk_income_stability", 2),
    horizonYears: aVal("risk_horizon_years", 20),
  };
  const targetGrowthPct = deriveTargetGrowthPct({
    risk_loss_tolerance: risk.lossTolerance,
    risk_income_stability: risk.incomeStability,
    risk_horizon_years: risk.horizonYears,
  });

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        {sp.error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{decodeURIComponent(sp.error)}</p> : null}
        {sp.ran ? (
          <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {t("ranSummary", { created: sp.created ?? "0", superseded: sp.superseded ?? "0" })}
          </p>
        ) : null}
        {sp.gap ? (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t("dataGap")}
            <ul className="mt-1 list-inside list-disc">
              {decodeURIComponent(sp.gap).split(",").map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        ) : null}
        <form action={runStrategyAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            {t("run")}
          </button>
        </form>
      </Card>

      <Card title={t("risk.title")}>
        {sp.savedRisk ? (
          <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("risk.saved")}</p>
        ) : null}
        <p className="mb-3 text-xs text-neutral-500">{t("risk.hint")}</p>
        <p className="mb-4 text-sm">
          {t("risk.currentTarget")}: <span className="font-semibold">{targetGrowthPct}%</span>
        </p>
        <form action={saveRiskAction} className="grid max-w-3xl grid-cols-3 items-end gap-3">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("risk.lossTolerance")}>
            <Select name="risk_loss_tolerance" defaultValue={String(risk.lossTolerance)}>
              {[1, 2, 3].map((v) => (
                <option key={v} value={v}>{t(`risk.lossTolerance_${v}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("risk.incomeStability")}>
            <Select name="risk_income_stability" defaultValue={String(risk.incomeStability)}>
              {[1, 2, 3].map((v) => (
                <option key={v} value={v}>{t(`risk.incomeStability_${v}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("risk.horizonYears")}>
            <TextInput name="risk_horizon_years" type="number" min={1} max={60} defaultValue={risk.horizonYears} />
          </Field>
          <div className="col-span-3">
            <SubmitButton label={t("risk.save")} />
          </div>
        </form>
      </Card>

      {recommendations.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">{t("empty")}</p>
        </Card>
      ) : (
        recommendations.map((rec) => {
          const r = (locale === "he" && rec.rationaleHe ? rec.rationaleHe : rec.rationale) as unknown as RationaleShape;
          const title = locale === "he" && rec.titleHe ? rec.titleHe : rec.title;
          return (
            <Card key={rec.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{title}</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                    {t("priority")}: {Number(rec.priorityScore).toFixed(0)}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5">
                    {t("confidence")}: {rec.confidenceScore}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5">
                    {t("completeness")}: {rec.dataCompletenessScore}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${rec.status === "ACCEPTED" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {t(`status.${rec.status}`)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <RBlock label={t("rationale.why")}>{r.why}</RBlock>
                <RBlock label={t("rationale.expectedImpact")}>{r.expectedImpact}</RBlock>
                <RList label={t("rationale.benefits")} items={r.benefits} />
                <RList label={t("rationale.risks")} items={r.risks} />
                <RList label={t("rationale.tradeoffs")} items={r.tradeoffs} />
                <RList label={t("rationale.alternatives")} items={r.alternatives} />
                <RBlock label={t("rationale.taxImplications")}>{r.taxImplications}</RBlock>
                <RBlock label={t("rationale.liquidityImplications")}>{r.liquidityImplications}</RBlock>
                <RBlock label={t("rationale.sensitivity")}>{r.sensitivity}</RBlock>
                <RBlock label={t("rationale.timeHorizon")}>{t(`horizon.${r.timeHorizon}`)}</RBlock>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-400">
                {rec.evidence.length > 0 ? (
                  <span>{t("evidence")}: {rec.evidence.map((e) => e.ledgerItem?.name).filter(Boolean).join(", ")}</span>
                ) : null}
                {rec.goalImpacts.length > 0 ? (
                  <span>{t("goalsImproved")}: {rec.goalImpacts.map((g) => g.goal.name).join(", ")}</span>
                ) : null}
                {rec.assumptionPins.length > 0 ? (
                  <span>
                    {t("assumptionsUsed")}: {rec.assumptionPins.map((p) => `${p.assumption.key}@v${p.assumption.version}`).join(", ")}
                  </span>
                ) : null}
              </div>

              {rec.status === "PROPOSED" ? (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {(["ACCEPTED", "REJECTED"] as const).map((decision) => (
                    <form key={decision} action={decideAction} className="flex items-end gap-2">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={rec.id} />
                      <input type="hidden" name="decision" value={decision} />
                      {decision === "ACCEPTED" ? (
                        <>
                          <TextInput name="expectedOutcome" placeholder={t("expectedOutcome")} />
                          <TextInput name="implementationDate" type="date" />
                          <TextInput name="note" placeholder={t("decisionNote")} />
                        </>
                      ) : null}
                      <button
                        type="submit"
                        className={
                          decision === "ACCEPTED"
                            ? "rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
                            : "rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700"
                        }
                      >
                        {decision === "ACCEPTED" ? t("accept") : t("reject")}
                      </button>
                    </form>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}

function RBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      <p className="text-neutral-700">{children}</p>
    </div>
  );
}

function RList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      <ul className="list-inside list-disc text-neutral-700">
        {items.map((i, n) => <li key={n}>{i}</li>)}
      </ul>
    </div>
  );
}
