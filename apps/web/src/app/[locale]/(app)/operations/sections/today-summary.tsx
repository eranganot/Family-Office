import { getTranslations } from "next-intl/server";

/**
 * M42b gate 4 — the compact rows at the top of Today.
 *
 * Counts that LINK OUT, deliberately not cards that render the thing. The whole failure
 * this rebuild is undoing was a page that showed everything at once; a landing view that
 * embeds the calendar, the month and the queue would re-accrete into exactly that within
 * a few milestones. A row says "there are 12 of these, over there" and stops.
 *
 * Suspense leads because it is the household's actual blocker: every closed month is
 * `provisional` while unverified rows exist, which is what caveats the surplus, makes
 * the allocation hand-off refuse, and weakened the M41 drift baseline. It had been
 * filed eight sections down a scrolling page.
 *
 * A zero row is rendered in muted text rather than hidden. "Nothing to classify" is
 * information; a missing row is indistinguishable from a broken query — the same
 * silence-reads-as-good-news mistake that shipped in M41c.
 */

export interface TodaySummaryProps {
  locale: string;
  /**
   * M42 health score. `null` = the engine refused (too little of the household is
   * measurable) — shown as a refusal, never as a low score. A composite that quietly
   * degrades to a number when half its inputs are missing is the one output here most
   * likely to be mistaken for a verdict.
   */
  healthScore: number | null;
  healthCoveragePct: number | null;
  /** `null` when the fetch failed — NOT collapsed into zero. */
  suspenseCount: number | null;
  /** True when the count hit the query limit, so it is a floor rather than a total. */
  suspenseAtLimit: boolean;
  driftCount: number | null;
  openActions: number;
  blockedActions: number;
}

export async function TodaySummarySection({
  locale,
  healthScore,
  healthCoveragePct,
  suspenseCount,
  suspenseAtLimit,
  driftCount,
  openActions,
  blockedActions,
}: TodaySummaryProps) {
  const t = await getTranslations("operations");

  const rows = [
    {
      key: "health",
      href: `/${locale}/operations/month`,
      label: t("rowHealth"),
      /*
         The coverage figure is part of the value, not a footnote. "72" and "72, from 60%
         of the household" are different claims, and only one of them is honest when
         goals are unwired and half the ledger is unmapped.
      */
      value:
        healthScore === null
          ? t("rowHealthRefused")
          : t("rowHealthValue", { score: healthScore, coverage: healthCoveragePct ?? 0 }),
      urgent: healthScore !== null && healthScore < 50,
      failed: false,
    },
    {
      key: "suspense",
      href: `/${locale}/transactions`,
      label: t("rowSuspense"),
      value:
        suspenseCount === null
          ? t("rowUnavailable")
          : suspenseAtLimit
            ? t("rowCountAtLeast", { n: suspenseCount })
            : t("rowCount", { n: suspenseCount }),
      urgent: suspenseCount !== null && suspenseCount > 0,
      failed: suspenseCount === null,
    },
    {
      key: "drift",
      href: `/${locale}/operations/month`,
      label: t("rowDrift"),
      value: driftCount === null ? t("rowUnavailable") : t("rowCount", { n: driftCount }),
      urgent: driftCount !== null && driftCount > 0,
      failed: driftCount === null,
    },
    {
      key: "actions",
      href: "#actions",
      label: t("rowActions"),
      value: t("rowActionsValue", { open: openActions, blocked: blockedActions }),
      urgent: false,
      failed: false,
    },
  ];

  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
      {rows.map((r) => (
        <li key={r.key}>
          <a
            href={r.href}
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50"
          >
            <span className="text-neutral-700">{r.label}</span>
            <span
              className={
                r.failed
                  ? "text-red-700"
                  : r.urgent
                    ? "font-medium text-amber-700"
                    : "text-neutral-500"
              }
            >
              {r.value}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
