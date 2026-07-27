"use client";

import { Link, usePathname } from "../i18n/navigation";

/**
 * Locale switcher that stays on the CURRENT page.
 *
 * The previous version hard-coded `href="/"`, so switching language always bounced
 * the user back to the dashboard — losing their place mid-task.
 *
 * `usePathname` from next-intl's `createNavigation` returns the pathname WITHOUT the
 * locale prefix (e.g. "/operations", not "/he/operations"), which is exactly what the
 * localised `Link` wants — it re-adds the prefix for the target locale itself.
 *
 * Client component because the pathname is only knowable at render time on the client;
 * the surrounding layout stays a server component.
 *
 * Query parameters are deliberately dropped: they are transient UI state here
 * (`?created=1`, `?edit=<id>`), and carrying them across would re-fire success banners.
 */
export function LocaleSwitch({
  currentLocale,
  label,
}: {
  currentLocale: string;
  label: string;
}) {
  const pathname = usePathname();
  const target = currentLocale === "he" ? "en" : "he";
  return (
    <Link href={pathname} locale={target} className="text-sm underline">
      {label}
    </Link>
  );
}
