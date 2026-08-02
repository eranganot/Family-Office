import { getTranslations } from "next-intl/server";
import { formatMoney, type Locale } from "@wealthos/i18n";
import { Card } from "../../../../../components/fields";

/**
 * M42b — the Monthly review section (drift alerts + EOY projection), extracted from
 * `operations/page.tsx`. Behaviour-preserving move; see `action-center.tsx` for why
 * extraction and restructuring are kept in separate commits.
 *
 * This section belongs to `/operations/month` once the routes exist — it is the monthly
 * ritual, not the daily one. Only the drift ALERT COUNT belongs on Today.
 */

export interface DriftAlertRow {
  id: string;
  title: string;
  titleHe: string | null;
  year: number | null;
  month: number | null;
  realisedBase: number | null;
  baselineBase: number | null;
  monthsInBaseline: number | null;
  isProvisional: boolean;
}

/** Mirrors the engine's discriminated union — a refusal is a first-class result here. */
export type EoyProjectionView =
  | {
      ok: true;
      monthlyRunRateBase: number;
      currentEoyBase: number;
      optimisedEoyBase: number;
      deltaBase: number;
      pendingWithoutImpact: number;
      monthsProvisionalExcluded: number;
    }
  | { ok: false; monthsObserved: number; minMonths: number };

export interface MonthlyReviewSectionProps {
  /** `null` means the fetch FAILED — never collapse it into an empty list. */
  driftAlerts: DriftAlertRow[] | null;
  eoy: EoyProjectionView | null;
  loc: Locale;
  baseCurrency: string;
}

export async function MonthlyReviewSection({
  driftAlerts,
  eoy,
  loc,
  baseCurrency,
}: MonthlyReviewSectionProps) {
  const t = await getTranslations("operations");

  return (
    <Card title={t("reviewTitle")}>
      <p className="mb-4 text-xs text-neutral-500">{t("reviewHint")}</p>

      {driftAlerts === null ? (
        /*
          A load failure, said out loud. Rendering an empty list here would read as
          "no drift" — a clean bill of health produced by a broken query. That exact
          bug shipped in M41c and had to be fixed in M41d.
        */
        <p className="mb-5 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {t("driftLoadFailed")}
        </p>
      ) : driftAlerts.length > 0 ? (
        <ul className="mb-5 space-y-2">
          {driftAlerts.map((d) => (
            <li
              key={d.id}
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              <p className="font-medium">{loc === "he" ? (d.titleHe ?? d.title) : d.title}</p>
              <p className="mt-1">
                {t("driftDetail", {
                  month: `${d.year}-${String(d.month ?? 0).padStart(2, "0")}`,
                  realised: formatMoney(d.realisedBase ?? 0, baseCurrency, loc),
                  baseline: formatMoney(d.baselineBase ?? 0, baseCurrency, loc),
                  months: d.monthsInBaseline ?? 0,
                })}
              </p>
              {/*
                QA: the alert stated a fact and stopped — "I don't know how this affects
                me or what to do". The recommended action was already in the record
                (`recommendedAction: RERUN_STRATEGY`) and simply never rendered. An alert
                that names a deviation without naming the response is an observation, not
                an alert.
              */}
              <p className="mt-1 font-medium">{t("driftAction")}</p>
              {/* The caveat travels WITH the number, not in a footnote nobody reads. */}
              {d.isProvisional ? <p className="mt-1">{t("driftProvisional")}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 text-sm text-neutral-500">{t("driftNone")}</p>
      )}

      <h3 className="mb-2 text-sm font-medium">{t("eoyTitle")}</h3>
      {eoy === null ? (
        <p className="text-sm text-neutral-500">{t("eoyUnavailable")}</p>
      ) : !eoy.ok ? (
        /*
          A refusal, rendered as a refusal. This is the one place the projection could
          most easily lie: a zero would draw as a flat line indistinguishable from a
          real forecast of no growth.
        */
        <p className="text-sm text-neutral-500">
          {t("eoyRefused", { observed: eoy.monthsObserved, need: eoy.minMonths })}
        </p>
      ) : (
        <div className="space-y-1 text-sm tabular-nums">
          <p>{t("eoyRunRate", { amount: formatMoney(eoy.monthlyRunRateBase, baseCurrency, loc) })}</p>
          <p>{t("eoyCurrent", { amount: formatMoney(eoy.currentEoyBase, baseCurrency, loc) })}</p>
          <p>{t("eoyOptimised", { amount: formatMoney(eoy.optimisedEoyBase, baseCurrency, loc) })}</p>
          <p className="font-medium text-emerald-700">
            {t("eoyDelta", { amount: formatMoney(eoy.deltaBase, baseCurrency, loc) })}
          </p>
          {/* Accepted actions that carry no quantified saving are COUNTED, not estimated. */}
          {eoy.pendingWithoutImpact > 0 ? (
            <p className="text-xs text-neutral-500">
              {t("eoyNoImpactCount", { n: eoy.pendingWithoutImpact })}
            </p>
          ) : null}
          {eoy.monthsProvisionalExcluded > 0 ? (
            <p className="text-xs text-neutral-500">
              {t("eoyProvisionalExcluded", { n: eoy.monthsProvisionalExcluded })}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
