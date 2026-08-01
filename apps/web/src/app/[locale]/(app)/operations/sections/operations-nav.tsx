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
 * nav. `/transactions` is deliberately absent: it is becoming a TOP-LEVEL destination,
 * not an Operations tab, because you go there for a different reason than running the
 * month.
 */
const TABS = [
  ["", "navToday"],
  ["/month", "navMonth"],
  ["/calendar", "navCalendar"],
] as const;

export async function OperationsNav({
  locale,
  active,
}: {
  locale: string;
  /** "" = Today. Matches the path suffix so a new route needs no extra wiring. */
  active: "" | "month" | "calendar";
}) {
  const t = await getTranslations("operations");

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-neutral-200 pb-2 text-sm">
      {TABS.map(([suffix, key]) => {
        const isActive = suffix.replace("/", "") === active;
        return (
          <a
            key={key}
            href={`/${locale}/operations${suffix}`}
            className={`rounded-lg px-3 py-1.5 ${
              isActive
                ? "bg-neutral-900 font-medium text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {t(key)}
          </a>
        );
      })}
    </nav>
  );
}
