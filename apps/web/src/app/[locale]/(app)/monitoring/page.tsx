import { formatDate, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { Card, ErrorBanner, SubmitButton, Explainer } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { acknowledgeAlertAction, reevaluateAction, runMonitoringAction } from "../../../../lib/actions/monitoring-actions";

const SEV_CLASS: Record<string, string> = {
  NONE: "bg-neutral-100 text-neutral-600",
  LOW: "bg-sky-50 text-sky-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-red-50 text-red-700",
};

export default async function MonitoringPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("monitoring");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;
  const l = locale as Locale;
  const isMonitoring = household.workflowState === "MONITORING";

  const [alerts, runs, snapshots, journal] = await Promise.all([
    trpc.monitoring.alerts(),
    trpc.monitoring.runs(),
    trpc.monitoring.snapshots(),
    trpc.journal.list(),
  ]);

  const sevBadge = (sev: string) => (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEV_CLASS[sev] ?? SEV_CLASS["NONE"]}`}>
      {t(`sev.${sev}`)}
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <Explainer title={t("explainerTitle")} paragraphs={[t("explainer1"), t("explainer2"), t("explainer3")]} />
      <Card title={t("title")}>
        <p className="text-xs text-neutral-500">{t("hint")}</p>
        <ErrorBanner message={error ? decodeURIComponent(error) : undefined} />
        <form action={runMonitoringAction} className="mt-3">
          <input type="hidden" name="locale" value={locale} />
          <SubmitButton label={t("runNow")} />
        </form>
        {!isMonitoring ? <p className="mt-2 text-xs text-neutral-500">{t("wrongPhase")}</p> : null}
      </Card>

      {/* Open alerts + re-evaluation actions */}
      <Card title={t("openAlerts")}>
        {alerts.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("noAlerts")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {alerts.map((a) => {
              const title = locale === "he" && a.titleHe ? a.titleHe : a.title;
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {sevBadge(a.severity)}
                      <span className="text-xs text-neutral-400">{t(`kinds.${a.kind}`)}</span>
                    </div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-neutral-500">
                      {t("action")}: {t(`act.${a.recommendedAction}`)}
                    </p>
                  </div>
                  {a.status === "OPEN" ? (
                    <form action={acknowledgeAlertAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50">
                        {t("acknowledge")}
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-neutral-400">{t("acknowledged")}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isMonitoring ? (
          <div className="mt-4 border-t border-neutral-200 pt-3">
            <p className="mb-2 text-xs text-neutral-500">{t("reevaluateHint")}</p>
            <div className="flex flex-wrap gap-2">
              <form action={reevaluateAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="target" value="VERIFICATION" />
                <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                  {t("toVerification")}
                </button>
              </form>
              <form action={reevaluateAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="target" value="STRATEGY" />
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  {t("toStrategy")}
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Monitoring-run history */}
      <Card title={t("runs")}>
        {runs.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("noRuns")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-neutral-400">
                  <th className="py-1 text-start">{t("takenAt")}</th>
                  <th className="py-1 text-start">{t("trigger")}</th>
                  <th className="py-1 text-start">{t("severity")}</th>
                  <th className="py-1 text-start">{t("drift")}</th>
                  <th className="py-1 text-start">{t("stale")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-100">
                    <td className="py-1.5">{formatDate(r.createdAt, l)}</td>
                    <td className="py-1.5">{r.trigger}</td>
                    <td className="py-1.5">{sevBadge(r.severity)}</td>
                    <td className="py-1.5">{r.alerts.filter((a) => a.kind !== "STALENESS").length}</td>
                    <td className="py-1.5">{r.itemsFlaggedStale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Snapshot timeline */}
      <Card title={t("snapshotTimeline")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-400">
                <th className="py-1 text-start">{t("takenAt")}</th>
                <th className="py-1 text-start">{t("kind")}</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="py-1.5">{formatDate(s.takenAt, l)}</td>
                  <td className="py-1.5">{s.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Journal outcomes — the loop's institutional memory */}
      {journal.filter((e) => e.actualOutcome).length > 0 ? (
        <Card title={t("title") + " · " + "journal"}>
          <div className="flex flex-col gap-2">
            {journal
              .filter((e) => e.actualOutcome)
              .map((e) => {
                const title = locale === "he" && e.recommendation.titleHe ? e.recommendation.titleHe : e.recommendation.title;
                return (
                  <div key={e.id} className="rounded-lg border border-neutral-100 p-2 text-sm">
                    <p className="font-medium">{title}</p>
                    <p className="text-xs text-neutral-500">{e.actualOutcome}</p>
                  </div>
                );
              })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
