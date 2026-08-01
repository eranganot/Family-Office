import { getTranslations } from "next-intl/server";

/**
 * M42b — the Operations sub-navigation.
 *
 * REAL LINKS between REAL ROUTES, not anchors into one long page. The anchor-nav
 * experiment was rejected for exactly that reason: it added a row to the top of a page
 * whose problem was that it had too much on it, and jumping to a heading is not the same
 * as arriving somewhere.
 *
 * Ordered by cadence — how often the owner is in that mode — rather than by build order.
 * `Transactions` is deliberately NOT here: it is becoming a top-level destination,
 * because you go there for a different reason than running the month.
 */

/*
 * Only routes that EXIST are listed — a tab that 404s teaches the owner not to trust the
 * nav.
 *
 * Transactions sits HERE, alongside Today / Month / Calendar, rather than in the main
 * nav (owner decision, revised 2026-07-29). Its URL stays top-level `/transactions`
 * because the page is not an Operations sub-view — but the owner reaches it from the
 * same row as everything else in this workspace, which is what actually matters. Hence
 * the absolute `href` rather than a suffix appended to /operations.
 */
const TABS = [
  { href: (l: string) => `/${l}/operations`, key: "navToday", id: "" },
  { href: (l: string) => `/${l}/operations/month`, key: "navMonth", id: "month" },
  { href: (l: string) => `/${l}/operations/calendar`, key: "navCalendar", id: "calendar" },
  { href: (l: string) => `/${l}/transactions`, key: "navTransactions", id: "transactions" },
] as const;

export async function OperationsNav({
  locale,
  active,
}: {
  locale: string;
  /** "" = Today. */
  active: "" | "month" | "calendar" | "transactions";
}) {
  const t = await getTranslations("operations");

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-neutral-200 pb-2 text-sm">
      {TABS.map((tab) => (
        <a
          key={tab.key}
          href={tab.href(locale)}
          className={`rounded-lg px-3 py-1.5 ${
            tab.id === active
              ? "bg-neutral-900 font-medium text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {t(tab.key)}
        </a>
      ))}
    </nav>
  );
}
