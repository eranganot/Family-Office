import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import type { WorkflowState } from "@prisma/client";
import { serverCaller } from "../../../lib/trpc-server";
import { Card } from "../../../components/fields";
import { Link } from "../../../i18n/navigation";
import { DonutChart } from "../../../components/dashboard-charts";

type Trpc = Awaited<ReturnType<typeof serverCaller>>;
type Translate = Awaited<ReturnType<typeof getTranslations>>;
type NextStep = { head: string; detail?: string; ctaLabel: string; href: string; tone: "action" | "ok" };

/**
 * A1 — the dashboard always answers "מה עכשיו?": current phase, what is blocking,
 * and one primary CTA into the exact tab that unblocks it. The four-phase loop is
 * enforced elsewhere; here it is narrated so a first-run user never has to discover
 * the flow by clicking tabs.
 */
async function computeNextStep(trpc: Trpc, t: Translate, state: WorkflowState): Promise<NextStep> {
  const nx = (k: string, v?: Record<string, string | number>) => t(`dashboard.next.${k}`, v);
  const { assessment } = await trpc.verification.assessment();

  if (state === "MAPPING") {
    if (assessment.totalCount === 0) {
      return { head: nx("mappingEmptyHead"), detail: nx("mappingEmptyDetail"), ctaLabel: nx("toMapping"), href: "/mapping", tone: "action" };
    }
    return { head: nx("mappingItemsHead", { count: assessment.totalCount }), detail: nx("mappingItemsDetail"), ctaLabel: nx("toVerify"), href: "/verification", tone: "action" };
  }

  if (state === "VERIFICATION") {
    if (assessment.gate.canEnterStrategy) {
      return { head: nx("verifyReadyHead"), detail: nx("verifyReadyDetail"), ctaLabel: nx("toAllocation"), href: "/verification", tone: "ok" };
    }
    const unverified = assessment.totalCount - assessment.verifiedCount;
    const parts: string[] = [];
    if (unverified > 0) parts.push(nx("verifyItems", { count: unverified }));
    if (assessment.pendingSuspense > 0) parts.push(nx("verifySuspense", { count: assessment.pendingSuspense }));
    return { head: parts.join(" · ") || nx("verifyItems", { count: unverified }), ctaLabel: nx("toVerify"), href: "/verification", tone: "action" };
  }

  if (state === "ALLOCATION") {
    const plan = await trpc.allocation.latest();
    if (!plan || plan.status === "SUPERSEDED") {
      return { head: nx("allocationRunHead"), detail: nx("allocationRunDetail"), ctaLabel: nx("toAllocation"), href: "/allocation", tone: "action" };
    }
    if (plan.status === "PROPOSED") {
      return { head: nx("allocationPendingHead"), ctaLabel: nx("toAllocation"), href: "/allocation", tone: "action" };
    }
    return { head: nx("allocationDoneHead"), detail: nx("allocationDoneDetail"), ctaLabel: nx("toAllocation"), href: "/allocation", tone: "ok" };
  }

  if (state === "STRATEGY") {
    const recs = await trpc.strategy.recommendations();
    if (recs.length === 0) {
      return { head: nx("strategyRunHead"), detail: nx("strategyRunDetail"), ctaLabel: nx("toStrategy"), href: "/strategy", tone: "action" };
    }
    const proposed = recs.filter((r) => r.status === "PROPOSED").length;
    if (proposed > 0) {
      return { head: nx("strategyPendingHead", { count: proposed }), ctaLabel: nx("toReview"), href: "/strategy", tone: "action" };
    }
    return { head: nx("strategyClearHead"), detail: nx("strategyClearDetail"), ctaLabel: nx("toStrategy"), href: "/strategy", tone: "ok" };
  }

  // MONITORING
  const alerts = await trpc.monitoring.alerts();
  if (alerts.length > 0) {
    return { head: nx("monitoringAlertsHead", { count: alerts.length }), ctaLabel: nx("toMonitoring"), href: "/monitoring", tone: "action" };
  }
  return { head: nx("monitoringClearHead"), detail: nx("monitoringClearDetail"), ctaLabel: nx("toMonitoring"), href: "/monitoring", tone: "ok" };
}

function NextStepCard({ step, t, state }: { step: NextStep; t: Translate; state: WorkflowState }) {
  const toneCls = step.tone === "ok" ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50";
  return (
    <section className={`rounded-xl border p-5 shadow-sm ${toneCls}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {t("dashboard.next.title")} · {t("phase.label")}: {t(`phase.${state}`)}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div dir="auto">
          <p className="text-base font-semibold text-neutral-900">{step.head}</p>
          {step.detail ? <p className="mt-0.5 text-sm text-neutral-600">{step.detail}</p> : null}
        </div>
        <Link href={step.href} className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          {step.ctaLabel}
        </Link>
      </div>
    </section>
  );
}

function GoalProgress({ funding, base, locale, t }: { funding: Awaited<ReturnType<Trpc["goals"]["fundingGap"]>>; base: string; locale: Locale; t: Translate }) {
  if (funding.results.length === 0) return <p className="text-sm text-neutral-500">{t("dashboard.goalsProgress.empty")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {funding.results.map((r) => {
        if (!r.computable) {
          return (
            <li key={r.goalId} dir="auto" className="text-sm">
              <div className="flex justify-between"><span className="font-medium">{r.name}</span><span className="text-xs text-amber-700">{t("dashboard.goalsProgress.notComputable")}</span></div>
            </li>
          );
        }
        const required = Number(r.requiredILS ?? "0");
        const projected = Number(r.projectedValueILS ?? "0");
        const pct = required > 0 ? Math.min(100, Math.round((projected / required) * 100)) : 0;
        const funded = Number(r.gapILS ?? "0") <= 0;
        return (
          <li key={r.goalId} dir="auto" className="text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-neutral-500">
                {funded
                  ? t("dashboard.goalsProgress.onTrack")
                  : r.requiredMonthlySavingILS
                    ? t("dashboard.goalsProgress.monthlySaving", { amount: formatMoney(r.requiredMonthlySavingILS, base, locale) })
                    : t("dashboard.goalsProgress.gap", { amount: formatMoney(r.gapILS ?? "0", base, locale) })}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className={`h-full ${funded ? "bg-green-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-0.5 text-right text-xs text-neutral-400">{pct}%</div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = await getTranslations();
  const trpc = await serverCaller();
  const household = await trpc.household.get();

  if (!household) {
    return (
      <Card>
        <p className="mb-4 text-sm text-neutral-600">{t("dashboard.noHousehold")}</p>
        <Link href="/household" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          {t("dashboard.setupCta")}
        </Link>
      </Card>
    );
  }

  const step = await computeNextStep(trpc, t, household.workflowState);
  const report = await trpc.networth.report();
  const base = report.baseCurrency;

  // M35 — richer dashboard data (all any-phase except scenarios, which is STRATEGY-gated).
  const funding = await trpc.goals.fundingGap();
  const liquid = await trpc.networth.liquidBreakdown();
  const fxRates = await trpc.networth.fxRates();
  const boi = await trpc.networth.boiRate();
  const alerts = await trpc.monitoring.alerts();
  let scenarios: { id: string; name: string; type: string; createdAt: Date }[] = [];
  let scenariosLocked = false;
  try {
    scenarios = await trpc.scenarios.list();
  } catch {
    scenariosLocked = true; // not in STRATEGY phase — degrade gracefully
  }

  const ASSET_KINDS = ["ACCOUNT", "REAL_ESTATE", "OTHER_ASSET"];
  const allocationData = Object.entries(report.byKind)
    .filter(([k, v]) => ASSET_KINDS.includes(k) && Number(v) > 0)
    .map(([k, v]) => ({ name: t(`kinds.${k}`), value: Number(v) }));
  const liquidData = [
    { name: t("dashboard.charts.growth"), value: liquid.growthILS },
    { name: t("dashboard.charts.defensive"), value: liquid.defensiveILS },
    { name: t("dashboard.charts.unknown"), value: liquid.unknownILS },
  ];

  const sev: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const a of alerts) if (a.severity in sev) sev[a.severity] = (sev[a.severity] ?? 0) + 1;
  const dateFmt = (d: Date | string) => new Date(d).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB");

  return (
    <div className="flex flex-col gap-6">
      <NextStepCard step={step} t={t} state={household.workflowState} />

      <div className="grid grid-cols-3 gap-4">
        <Card title={t("dashboard.assets")}><p className="text-2xl font-bold">{formatMoney(report.totalAssets, base, locale)}</p></Card>
        <Card title={t("dashboard.liabilities")}><p className="text-2xl font-bold">{formatMoney(report.totalLiabilities, base, locale)}</p></Card>
        <Card title={t("dashboard.netWorth")}><p className="text-2xl font-bold text-blue-700">{formatMoney(report.netWorth, base, locale)}</p></Card>
      </div>

      <Card title={t("dashboard.goalsProgress.title")}>
        <GoalProgress funding={funding} base={base} locale={locale} t={t} />
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title={t("dashboard.charts.allocationTitle")}>
          {allocationData.length > 0 ? <DonutChart data={allocationData} locale={locale} currency={base} /> : <p className="text-sm text-neutral-500">{t("dashboard.charts.empty")}</p>}
        </Card>
        <Card title={t("dashboard.charts.liquidTitle")}>
          {liquid.growthILS + liquid.defensiveILS + liquid.unknownILS > 0 ? <DonutChart data={liquidData} locale={locale} currency={base} /> : <p className="text-sm text-neutral-500">{t("dashboard.charts.empty")}</p>}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title={t("dashboard.fxPanel.title")}>
          {boi ? <p className="mb-2 text-sm"><span className="text-neutral-500">{t("dashboard.fxPanel.boiRate")}: </span><span className="font-semibold">{Number(boi.value).toFixed(2)}%</span> <span className="text-xs text-neutral-400">{t("dashboard.fxPanel.asOf", { date: dateFmt(boi.asOf) })}</span></p> : null}
          {fxRates.length === 0 ? (
            <p className="text-sm text-neutral-500">{t("dashboard.fxPanel.none")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {fxRates.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.from} → {r.to}</span>
                  <span className="font-medium">{Number(r.rate).toFixed(4)} <span className="text-xs text-neutral-400">{t("dashboard.fxPanel.asOf", { date: dateFmt(r.asOf) })}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("dashboard.monitoringPanel.title")}>
          {alerts.length === 0 ? (
            <p className="text-sm text-green-700">{t("dashboard.monitoringPanel.clear")}</p>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium">{t("dashboard.monitoringPanel.open", { count: alerts.length })}</p>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">{t("dashboard.monitoringPanel.high")}: {sev.HIGH}</span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{t("dashboard.monitoringPanel.medium")}: {sev.MEDIUM}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">{t("dashboard.monitoringPanel.low")}: {sev.LOW}</span>
              </div>
            </>
          )}
          <Link href="/monitoring" className="mt-3 inline-block text-xs text-blue-600 underline">{t("dashboard.monitoringPanel.view")}</Link>
        </Card>
      </div>

      <Card title={t("dashboard.scenariosPanel.title")}>
        {scenariosLocked ? (
          <p className="text-sm text-neutral-500">{t("dashboard.scenariosPanel.lockedPhase")}</p>
        ) : scenarios.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("dashboard.scenariosPanel.empty")}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1 text-sm">
              {scenarios.slice(0, 5).map((s) => (
                <li key={s.id} dir="auto" className="flex justify-between">
                  <span>{s.name}</span>
                  <span className="text-xs text-neutral-400">{dateFmt(s.createdAt)}</span>
                </li>
              ))}
            </ul>
            <Link href="/scenarios" className="mt-3 inline-block text-xs text-blue-600 underline">{t("dashboard.scenariosPanel.viewAll")}</Link>
          </>
        )}
      </Card>

      {report.excluded.length > 0 ? (
        <Card title={t("dashboard.excluded")}>
          <ul className="flex flex-col gap-1 text-sm text-amber-700">
            {report.excluded.map((e) => (
              <li key={e.id}>{e.name} — {t(`dashboard.excludedReason.${e.reason}`)}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
