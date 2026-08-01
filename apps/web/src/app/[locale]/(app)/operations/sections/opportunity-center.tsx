import { getTranslations } from "next-intl/server";
import { formatMoney, type Locale } from "@wealthos/i18n";
import { Card, Explainer, SubmitButton, SuccessBanner } from "../../../../../components/fields";
import {
  runOpportunitiesAction,
  setOpportunityStatusAction,
} from "../../../../../lib/actions/operations-actions";

/**
 * M42b — the Opportunity Center, extracted from `operations/page.tsx`.
 * Behaviour-preserving move; see `action-center.tsx` for why extraction and
 * restructuring are separate commits.
 *
 * Once the routes exist this belongs on Today — but as COMPACT ROWS, not these full
 * cards. Full cards are why Today would re-accrete into the page this rebuild exists to
 * undo. The rationale, risks and action steps become a detail view.
 */

export interface OpportunityRow {
  id: string;
  type: string;
  title: string;
  titleHe: string | null;
  status: string;
  cadence: string;
  difficulty: string | null;
  confidenceScore: number;
  priorityScore: number;
  impactMonthlyBase: number | null;
  impactAnnualBase: number | null;
  impactEoyBase: number | null;
  daysUntilExpiry: number | null;
  rationale: unknown;
  rationaleHe: unknown;
  actionItems: unknown;
}

export interface OpportunityCenterSectionProps {
  /** `null` = never run. Distinct from "ran and found nothing", and said differently. */
  opps: { items: OpportunityRow[]; totalMonthlyBase: number; totalAnnualBase: number } | null;
  locale: string;
  loc: Locale;
  baseCurrency: string;
  ranMessage?: string | undefined;
  savedMessage?: string | undefined;
  /** True when any consumed tax matrix is still ownerReviewed=false (B2/B3). */
  usesUnreviewedTax: boolean;
}

export async function OpportunityCenterSection({
  opps,
  locale,
  loc,
  baseCurrency,
  ranMessage,
  savedMessage,
  usesUnreviewedTax,
}: OpportunityCenterSectionProps) {
  const t = await getTranslations("operations");

  return (
    <Card title={t("oppsTitle")}>
      <p className="mb-4 text-xs text-neutral-500">{t("oppsHint")}</p>

      <SuccessBanner message={ranMessage} />
      <SuccessBanner message={savedMessage} />
      {usesUnreviewedTax ? (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("oppsUnreviewedTax")}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <form action={runOpportunitiesAction}>
          <input type="hidden" name="locale" value={locale} />
          <SubmitButton label={t("oppsRecompute")} />
        </form>
        {opps && opps.items.length > 0 ? (
          <span className="text-xs text-neutral-500">
            {t("oppsTotals", {
              monthly: formatMoney(opps.totalMonthlyBase, baseCurrency, loc),
              annual: formatMoney(opps.totalAnnualBase, baseCurrency, loc),
            })}
          </span>
        ) : null}
      </div>

      {opps && opps.items.length > 0 ? (
        <ul className="space-y-4">
          {opps.items.map((o) => {
            const rat = (loc === "he" ? o.rationaleHe : o.rationale) as {
              why?: string;
              risks?: string[];
              tradeoffs?: string[];
            } | null;
            const acts = o.actionItems as { en?: string[]; he?: string[] } | null;
            const steps = (loc === "he" ? acts?.he : acts?.en) ?? [];
            // An expiring opportunity is the only kind that gets smaller by waiting,
            // so proximity is shown on the card rather than buried in the rationale.
            const expiry =
              o.daysUntilExpiry === null
                ? null
                : o.daysUntilExpiry < 0
                  ? t("oppsExpired")
                  : o.daysUntilExpiry === 0
                    ? t("dueToday")
                    : t("oppsExpiresIn", { n: o.daysUntilExpiry });
            return (
              <li key={o.id} className="rounded border border-neutral-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {loc === "he" ? (o.titleHe ?? o.title) : o.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {o.status !== "PROPOSED" ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        {t(`oppsStatus.${o.status}`)}
                      </span>
                    ) : null}
                    {expiry ? (
                      <span
                        className={`rounded px-2 py-0.5 ${
                          (o.daysUntilExpiry ?? 99) <= 14
                            ? "bg-amber-50 text-amber-700"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {expiry}
                      </span>
                    ) : null}
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-500">
                      {t(`oppsDifficulty.${o.difficulty ?? "MODERATE"}`)}
                    </span>
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-500">
                      {t(`oppsCadence.${o.cadence}`)}
                    </span>
                  </div>
                </div>

                {o.impactMonthlyBase !== null || o.impactAnnualBase !== null ? (
                  <p className="mt-2 text-xs tabular-nums text-neutral-600">
                    {t("oppsImpact", {
                      monthly: formatMoney(o.impactMonthlyBase ?? 0, baseCurrency, loc),
                      annual: formatMoney(o.impactAnnualBase ?? 0, baseCurrency, loc),
                      eoy: formatMoney(o.impactEoyBase ?? 0, baseCurrency, loc),
                    })}
                  </p>
                ) : o.type === "RENEGOTIATE_RECURRING_COMMITMENTS" ? (
                  // Renegotiation knows the SPEND, not the saving. Saying so on the card
                  // matters: an amount with no label reads as a saving by default.
                  <p className="mt-2 text-xs text-neutral-500">{t("oppsSpendNotSaving")}</p>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">{t("oppsNoCashImpact")}</p>
                )}

                {rat?.why ? <p className="mt-2 text-sm text-neutral-700">{rat.why}</p> : null}

                {steps.length > 0 ? (
                  <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-neutral-700">
                    {steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                ) : null}

                <div className="mt-3">
                  <Explainer
                    title={t("oppsWhyNot")}
                    paragraphs={[
                      ...(rat?.risks ?? []),
                      ...(rat?.tradeoffs ?? []),
                      t("oppsConfidence", { n: o.confidenceScore, p: o.priorityScore }),
                    ]}
                  />
                </div>

                {o.status === "PROPOSED" ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(["ACCEPTED", "IMPLEMENTED", "REJECTED"] as const).map((st) => (
                      <form key={st} action={setOpportunityStatusAction} className="inline">
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="status" value={st} />
                        <button
                          type="submit"
                          className={`text-xs underline ${
                            st === "REJECTED" ? "text-neutral-500" : "text-emerald-700"
                          }`}
                        >
                          {t(`oppsAction.${st}`)}
                        </button>
                      </form>
                    ))}
                  </div>
                ) : (
                  /*
                   * M40c — un-accept. `setStatus` has always accepted PROPOSED, but only
                   * PROPOSED cards rendered actions, so a mis-click was permanent from the
                   * screen: an ACCEPTED type is never re-proposed by a run, so the card
                   * could not come back on its own either. Reverting returns the item to
                   * the normal lifecycle — it counts toward the headline again and the next
                   * run may supersede or refresh it.
                   */
                  <div className="mt-3 flex flex-wrap gap-3">
                    <form action={setOpportunityStatusAction} className="inline">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="status" value="PROPOSED" />
                      <button type="submit" className="text-xs text-neutral-500 underline">
                        {t("oppsAction.REVERT")}
                      </button>
                    </form>
                    <span className="text-xs text-neutral-400">{t("oppsRevertHint")}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">{opps ? t("oppsEmpty") : t("oppsNeverRun")}</p>
      )}
    </Card>
  );
}
