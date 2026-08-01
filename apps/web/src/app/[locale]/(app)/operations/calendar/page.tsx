import { getTranslations } from "next-intl/server";
import type { Locale } from "@wealthos/i18n";
import { serverCaller } from "../../../../../lib/trpc-server";
import { CalendarSection } from "../sections/calendar";
import { OperationsNav } from "../sections/operations-nav";

/**
 * M42b — `/operations/calendar`. The first real ROUTE of the split.
 *
 * This is where the extraction work starts paying off. Note what this page fetches:
 * the calendar and the recurring decisions, and nothing else. `/operations` still
 * computes the period, opportunities, actions, EOY, drift, suspense, categories AND
 * transactions on every single load — that is the cost the route split removes, one
 * page at a time.
 *
 * Calendar and recurring live together on purpose: a recurring decision is the rule and
 * the calendar events are what that rule produces.
 */

export default async function OperationsCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cw?: string; calendarBuilt?: string; calendarUpdated?: string; recurringSaved?: string; suggestApplied?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations("operations");
  const tf = await getTranslations("forms");
  const loc = locale as Locale;
  const trpc = await serverCaller();

  // Reading NEVER generates: building the calendar writes rows, and a page load must
  // not. Empty until the owner presses rebuild.
  //
  // Default 60 days, not 400 (owner, 2026-07-29). 400 showed a year of statutory dates
  // on arrival, which buries the handful that are actually imminent — the whole point of
  // this view is proximity. The wider windows stay one click away.
  const calWindow = sp.cw ? Math.min(400, Math.max(30, Number(sp.cw))) : 60;
  const calendar = await trpc.operations.calendar
    .upcoming({ windowDays: calWindow })
    .catch(() => null);
  const recurring = await trpc.operations.recurring.list().catch(() => []);

  return (
    <div className="flex flex-col gap-6">
      <OperationsNav locale={locale} active="calendar" />
      <CalendarSection
        calendar={calendar}
        recurring={recurring}
        calWindow={calWindow}
        locale={locale}
        loc={loc}
        baseCurrency="ILS"
        builtMessage={sp.calendarBuilt ? t("calendarBuilt", { n: sp.calendarBuilt }) : undefined}
        savedMessage={sp.calendarUpdated || sp.recurringSaved ? tf("saved") : undefined}
        suggestionsMessage={
          sp.suggestApplied ? t("suggestionsApplied", { n: sp.suggestApplied }) : undefined
        }
      />
    </div>
  );
}
