import { getTranslations } from "next-intl/server";
import type { Locale } from "@wealthos/i18n";
import { SuccessBanner } from "../../../../../components/fields";
import { serverCaller } from "../../../../../lib/trpc-server";
import { MonthOverviewSection, type DiagnosticsView } from "../sections/month-overview";
import { MonthlyReviewSection } from "../sections/monthly-review";
import { OperationsNav } from "../sections/operations-nav";

/**
 * M42b — `/operations/month`. The monthly ritual, in one place.
 *
 * The overview (navigation, close/reopen, surplus, safe-to-spend, working capital) and
 * the monthly review (drift alerts + EOY projection) belong together: closing a month is
 * what PRODUCES the review, and reading the review is how you decide whether the close
 * was sound. They were previously ~250 lines apart on the same scrolling page.
 *
 * This route fetches the period, its diagnostics, the category tree, the drift alerts
 * and the EOY projection — and nothing about transactions, imports, opportunities or
 * actions. `computePeriod` is the single most expensive call in this module and it now
 * runs only when the owner is actually looking at a month.
 */

interface FlatCategory {
  id: string;
  nameEn: string;
  nameHe: string;
}

export default async function OperationsMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    y?: string;
    m?: string;
    recomputed?: string;
    closed?: string;
    reopened?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations("operations");
  const loc = locale as Locale;
  const trpc = await serverCaller();

  // ?y=&m= drive month navigation; absent means the current month.
  const navYear = sp.y ? Number(sp.y) : undefined;
  const navMonth = sp.m ? Number(sp.m) : undefined;
  const period = await trpc.operations.period.current(
    navYear && navMonth ? { year: navYear, month: navMonth } : undefined,
  );
  const { year, month, row: periodRow, computed } = period;

  const availableMonths = await trpc.operations.period.months().catch(() => []);
  const diag = await trpc.operations.diagnostics.month({ year, month }).catch(() => null);
  const cats = await trpc.operations.categories.tree();
  const eoy = await trpc.operations.projection.eoy().catch(() => null);
  // A failed fetch resolves to null, never to an empty list: rendering "no drift" for a
  // broken query is a clean bill of health nobody earned. See M41d.
  const driftAlerts = await trpc.operations.review.driftAlerts().catch(() => null);

  const flat = cats.flat as unknown as FlatCategory[];
  const byId = new Map(flat.map((c) => [c.id, c]));
  const baseCurrency = "ILS";

  return (
    <div className="flex flex-col gap-6">
      <OperationsNav locale={locale} active="month" />

      <SuccessBanner
        message={
          sp.recomputed
            ? t("recomputedOk")
            : sp.closed
              ? t("closedOk")
              : sp.reopened
                ? t("reopenedOk")
                : undefined
        }
      />

      <MonthOverviewSection
        year={year}
        month={month}
        locale={locale}
        loc={loc}
        baseCurrency={baseCurrency}
        availableMonths={availableMonths}
        periodRow={periodRow}
        flow={computed.flow}
        surplus={computed.surplus}
        sts={computed.safeToSpend}
        committedInstalmentsBase={computed.committedInstalmentsBase}
        workingCapital={computed.workingCapital}
        diag={diag as DiagnosticsView | null}
        byId={byId}
      />

      <MonthlyReviewSection
        driftAlerts={driftAlerts}
        eoy={eoy}
        loc={loc}
        baseCurrency={baseCurrency}
      />
    </div>
  );
}
