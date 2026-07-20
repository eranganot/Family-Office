import { getTranslations } from "next-intl/server";
import { PhaseGate } from "../phase-gate";
import { deriveTargetGrowthPct } from "@wealthos/engine-strategy";
import { decideAction, dismissRecommendationAction, markImplementedAction, runStrategyAction, saveRiskAction, updateGoalPlanAction } from "../../../../lib/actions/strategy-actions";
import { Card, Field, Select, SubmitButton, TextInput, Explainer } from "../../../../components/fields";
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

interface NarrativeShape { achieve: string; how: string; outcomes: string[] }
interface MetricsShape { targetGrowthPct: number; currentGrowthPct: number | null; goalsTotal: number; goalsFunded: number; actionsTotal: number; horizonYears: number }
interface PinShape { key: string; version: number }

const RESOLVE_HINT_TYPES = new Set([
  "CLOSE_SURVIVOR_GAP",
  "ADD_DISABILITY_COVER",
  "CLOSE_MORTGAGE_LIFE_GAP",
  "MAXIMIZE_HISHTALMUT_HEADROOM",
  "MAXIMIZE_PENSION_HEADROOM",
]);

export default async function StrategyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; ran?: string; created?: string; superseded?: string; gap?: string; savedRisk?: string; ok?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations("strategy");
  const tAlloc = await getTranslations("allocation");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;
  const approvedPlanEarly = await trpc.allocation.latest();
  const basedOnPlan = approvedPlanEarly?.status === "APPROVED" ? approvedPlanEarly : null;

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
  const plan = await trpc.strategy.plan();
  const goals = await trpc.goals.list();
  const activeGoals = goals.filter((g) => g.status === "ACTIVE");
  const assumptions = await trpc.registry.assumptions();
  const aVal = (key: string, fallback: number) => {
    const row = assumptions.find((a) => a.key === key);
    return row ? Number(row.value) : fallback;
  };
  const risk = {
    lossTolerance: aVal("risk_loss_tolerance", 2),
    incomeStability: aVal("risk_income_stability", 2),
    horizonYears: aVal("risk_horizon_years", 20),
    drawdownReaction: aVal("risk_drawdown_reaction", 2),
    investmentExperience: aVal("risk_investment_experience", 2),
    spendingFlexibility: aVal("risk_spending_flexibility", 2),
  };
  const targetGrowthPct = deriveTargetGrowthPct({
    risk_loss_tolerance: risk.lossTolerance,
    risk_income_stability: risk.incomeStability,
    risk_horizon_years: risk.horizonYears,
    risk_drawdown_reaction: risk.drawdownReaction,
    risk_investment_experience: risk.investmentExperience,
    risk_spending_flexibility: risk.spendingFlexibility,
  });

  const narrative = plan ? (locale === "he" ? (plan.narrative as unknown as { he: NarrativeShape }).he : (plan.narrative as unknown as { en: NarrativeShape }).en) : null;
  const metrics = plan ? (plan.metrics as unknown as MetricsShape) : null;
  const pins = plan ? (plan.pins as unknown as PinShape[]) : [];
  const doneCount = recommendations.filter((r) => r.status === "ACCEPTED").length;
  const totalActions = metrics?.actionsTotal ?? recommendations.length;
  const progressPct = totalActions > 0 ? Math.min(100, Math.round((doneCount / totalActions) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <Explainer title={t("explainerTitle")} paragraphs={[t("explainer1"), t("explainer2"), t("explainer3")]} />

      {plan && narrative && metrics ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-neutral-900">{t("synthesis.title")}</h2>
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{t("synthesis.engineTag")}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{t("synthesis.achieveLabel")}</div>
              <p dir="auto" className="text-neutral-700">{narrative.achieve}</p>
            </div>
            <div>
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{t("synthesis.howLabel")}</div>
              <p dir="auto" className="text-neutral-700">{narrative.how}</p>
            </div>
            <div>
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{t("synthesis.outcomesLabel")}</div>
              <ul dir="auto" className="list-inside list-disc text-neutral-700">
                {narrative.outcomes.map((o, n) => <li key={n}>{o}</li>)}
              </ul>
            </div>
            <div>
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{t("synthesis.progressLabel")}</div>
              <div className="mb-1 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                  <div className="h-full bg-blue-600" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="whitespace-nowrap text-xs font-medium">{t("synthesis.progressDone", { done: doneCount, total: totalActions })}</span>
              </div>
              <p className="text-xs text-neutral-500">{t("synthesis.progressHint")}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-blue-100 pt-2 text-xs text-neutral-400">
            <span>{t("synthesis.pinsLabel")}:</span>
            <span className="rounded bg-white px-1.5 py-0.5 font-mono">snapshot {plan.snapshotId.slice(0, 6)}…</span>
            <span className="rounded bg-white px-1.5 py-0.5 font-mono">{plan.engineVersion}</span>
            {pins.slice(0, 3).map((p) => <span key={p.key} className="rounded bg-white px-1.5 py-0.5 font-mono">{p.key}@v{p.version}</span>)}
            <span className="ms-auto">{t("synthesis.generatedOn", { date: new Date(plan.createdAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB") })}</span>
          </div>
        </section>
      ) : null}

      <Card title={t("title")}>
        {basedOnPlan ? (
          <p className="mb-3 rounded-lg bg-blue-50/60 px-3 py-2 text-xs text-blue-800" dir="auto">
            {tAlloc("basedOnPlan", { date: new Date(basedOnPlan.approvedAt ?? basedOnPlan.createdAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB") })}
          </p>
        ) : null}
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
        {!plan ? <p className="mb-3 text-sm text-neutral-500">{t("synthesis.empty")}</p> : null}
        <form action={runStrategyAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            {t("run")}
          </button>
        </form>
      </Card>

      <Card title={t("finetune.title")}>
        <p className="mb-4 text-xs text-neutral-500">{t("finetune.hint")}</p>
        {sp.savedRisk ? <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("risk.saved")}</p> : null}
        {sp.ok === "goalTuned" ? <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("finetune.saved")}</p> : null}

        <p className="mb-3 text-sm">{t("risk.currentTarget")}: <span className="font-semibold">{targetGrowthPct}%</span></p>
        <form action={saveRiskAction} className="mb-6 grid max-w-3xl grid-cols-3 items-end gap-3">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("risk.lossTolerance")}>
            <Select name="risk_loss_tolerance" defaultValue={String(risk.lossTolerance)}>
              {[1, 2, 3].map((v) => <option key={v} value={v}>{t(`risk.lossTolerance_${v}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("risk.incomeStability")}>
            <Select name="risk_income_stability" defaultValue={String(risk.incomeStability)}>
              {[1, 2, 3].map((v) => <option key={v} value={v}>{t(`risk.incomeStability_${v}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("risk.horizonYears")}>
            <TextInput name="risk_horizon_years" type="number" min={1} max={60} defaultValue={risk.horizonYears} />
          </Field>
          <Field label={t("risk.drawdownReaction")}>
            <Select name="risk_drawdown_reaction" defaultValue={String(risk.drawdownReaction)}>
              {[1, 2, 3].map((v) => <option key={v} value={v}>{t(`risk.drawdownReaction_${v}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("risk.investmentExperience")}>
            <Select name="risk_investment_experience" defaultValue={String(risk.investmentExperience)}>
              {[1, 2, 3].map((v) => <option key={v} value={v}>{t(`risk.investmentExperience_${v}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("risk.spendingFlexibility")}>
            <Select name="risk_spending_flexibility" defaultValue={String(risk.spendingFlexibility)}>
              {[1, 2, 3].map((v) => <option key={v} value={v}>{t(`risk.spendingFlexibility_${v}`)}</option>)}
            </Select>
          </Field>
          <div className="col-span-3"><SubmitButton label={t("risk.save")} /></div>
        </form>

        <div className="mb-2 text-sm font-semibold">{t("finetune.goalsTitle")}</div>
        {activeGoals.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("finetune.noGoals")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {activeGoals.map((g) => (
              <form key={g.id} action={updateGoalPlanAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-100 p-2">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="id" value={g.id} />
                <span dir="auto" className="min-w-[8rem] flex-1 text-sm font-medium">{g.name}</span>
                <Field label={t("finetune.priority")}>
                  <TextInput name="priority" type="number" min={1} max={99} defaultValue={g.priority} />
                </Field>
                <Field label={t("finetune.requiredFunding")}>
                  <TextInput name="requiredFunding" type="number" min={0} defaultValue={g.requiredFunding ? String(g.requiredFunding) : ""} />
                </Field>
                <SubmitButton label={t("finetune.save")} />
              </form>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-neutral-100 pt-3">
          <div className="mb-1 text-sm font-semibold">{t("finetune.amountsTitle")}</div>
          <p className="mb-2 text-xs text-neutral-500">{t("finetune.amountsHint")}</p>
          <Link href="/allocation" className="inline-block rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">{t("finetune.editAmounts")}</Link>
        </div>
      </Card>

      {recommendations.length === 0 ? (
        <Card><p className="text-sm text-neutral-500">{t("empty")}</p></Card>
      ) : (
        recommendations.map((rec) => {
          const r = (locale === "he" && rec.rationaleHe ? rec.rationaleHe : rec.rationale) as unknown as RationaleShape;
          const title = locale === "he" && rec.titleHe ? rec.titleHe : rec.title;
          return (
            <Card key={rec.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{title}</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{t("priority")}: {Number(rec.priorityScore).toFixed(0)}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5">{t("confidence")}: {rec.confidenceScore}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5">{t("completeness")}: {rec.dataCompletenessScore}</span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${rec.status === "ACCEPTED" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{t(`status.${rec.status}`)}</span>
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

              {(() => {
                const acts = rec.actionItems as { en?: string[]; he?: string[] } | null;
                const list = acts ? (locale === "he" ? (acts.he ?? acts.en) : (acts.en ?? acts.he)) : null;
                if (!list || list.length === 0) return null;
                return (
                  <div className="mt-4 rounded-lg bg-blue-50/60 p-3">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">{t("actionItems")}</div>
                    <ol className="list-inside list-decimal text-sm text-neutral-800">
                      {list.map((step, n) => <li key={n} className="mb-0.5" dir="auto">{step}</li>)}
                    </ol>
                  </div>
                );
              })()}

              <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-400">
                {rec.evidence.length > 0 ? <span>{t("evidence")}: {rec.evidence.map((e) => e.ledgerItem?.name).filter(Boolean).join(", ")}</span> : null}
                {rec.goalImpacts.length > 0 ? <span>{t("goalsImproved")}: {rec.goalImpacts.map((g) => g.goal.name).join(", ")}</span> : null}
                {rec.assumptionPins.length > 0 ? <span>{t("assumptionsUsed")}: {rec.assumptionPins.map((p) => `${p.assumption.key}@v${p.assumption.version}`).join(", ")}</span> : null}
              </div>

              {RESOLVE_HINT_TYPES.has(rec.type) ? (
                <div dir="auto" className="mt-3 rounded-lg bg-blue-50/60 px-3 py-2 text-sm text-blue-800">
                  <span className="font-medium">{t("resolveTitle")}: </span>{t(`resolve.${rec.type}`)}
                </div>
              ) : null}

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
                      <button type="submit" className={decision === "ACCEPTED" ? "rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white" : "rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700"}>
                        {decision === "ACCEPTED" ? t("accept") : t("reject")}
                      </button>
                    </form>
                  ))}
                </div>
              ) : null}

              {rec.status === "ACCEPTED" ? (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <form action={markImplementedAction} className="flex items-end gap-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={rec.id} />
                    <TextInput name="actualOutcome" placeholder={t("outcomePlaceholder")} />
                    <button type="submit" className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white">{t("markDone")}</button>
                  </form>
                  <form action={dismissRecommendationAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={rec.id} />
                    <button type="submit" className="text-xs text-neutral-400 underline">{t("dismiss")}</button>
                  </form>
                </div>
              ) : null}
            </Card>
          );
        })
      )}
      <PhaseGate locale={locale} />
    </div>
  );
}

function RBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      <p dir="auto" className="text-neutral-700">{children}</p>
    </div>
  );
}

function RList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      <ul dir="auto" className="list-inside list-disc text-neutral-700">
        {items.map((i, n) => <li key={n}>{i}</li>)}
      </ul>
    </div>
  );
}
