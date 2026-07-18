import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import type { WorkflowState } from "@prisma/client";
import { serverCaller } from "../../../lib/trpc-server";
import { Card } from "../../../components/fields";
import { Link } from "../../../i18n/navigation";

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
        <Link
          href={step.href}
          className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          {step.ctaLabel}
        </Link>
      </div>
    </section>
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

  return (
    <div className="flex flex-col gap-6">
      <NextStepCard step={step} t={t} state={household.workflowState} />
      <div className="grid grid-cols-3 gap-4">
        <Card title={t("dashboard.assets")}>
          <p className="text-2xl font-bold">{formatMoney(report.totalAssets, base, locale)}</p>
        </Card>
        <Card title={t("dashboard.liabilities")}>
          <p className="text-2xl font-bold">{formatMoney(report.totalLiabilities, base, locale)}</p>
        </Card>
        <Card title={t("dashboard.netWorth")}>
          <p className="text-2xl font-bold text-blue-700">{formatMoney(report.netWorth, base, locale)}</p>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card title={t("dashboard.byKind")}>
          <ul className="flex flex-col gap-2 text-sm">
            {Object.entries(report.byKind).map(([kind, value]) => (
              <li key={kind} className="flex justify-between">
                <span>{t(`kinds.${kind}`)}</span>
                <span className="font-medium">{formatMoney(value, base, locale)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("dashboard.byCurrency")}>
          <ul className="flex flex-col gap-2 text-sm">
            {Object.entries(report.byCurrency).map(([ccy, value]) => (
              <li key={ccy} className="flex justify-between">
                <span>{ccy}</span>
                <span className="font-medium">{formatMoney(value, ccy, locale)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {report.excluded.length > 0 ? (
        <Card title={t("dashboard.excluded")}>
          <ul className="flex flex-col gap-1 text-sm text-amber-700">
            {report.excluded.map((e) => (
              <li key={e.id}>
                {e.name} — {t(`dashboard.excludedReason.${e.reason}`)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
