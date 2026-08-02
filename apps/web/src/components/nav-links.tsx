"use client";

import { Link, usePathname } from "../i18n/navigation";

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  /** Group heading. Omitted for standalone links like the dashboard. */
  label: string;
  items: NavItem[];
}

/**
 * M42 — grouped top navigation.
 *
 * This was fourteen flat links, accreted one per milestone, and it had reached the point
 * where finding anything meant reading all of it — the same failure `/operations` had,
 * one level up. Grouping by what the owner is DOING mirrors the phase model the app
 * already teaches (map → verify → decide → run), so the nav reinforces the workflow
 * instead of presenting fourteen equal-weight destinations.
 *
 * Native `<details>` rather than a JS dropdown, deliberately: it works without
 * client-side state, is keyboard accessible for free, and behaves correctly in RTL —
 * three things a hand-rolled menu gets wrong before it gets right. The group containing
 * the current page is open on arrival, so the owner never has to hunt for where he is.
 */
export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkClass = (href: string) =>
    isActive(href)
      ? "font-semibold text-blue-700"
      : "font-medium text-neutral-600 hover:text-neutral-900 hover:underline";

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-neutral-200 pb-3 text-sm">
      {groups.map((group) => {
        // A single-item group is a plain link, not a disclosure with one option in it.
        if (group.items.length === 1) {
          const only = group.items[0]!;
          return (
            <Link
              key={only.href}
              href={only.href}
              className={linkClass(only.href)}
              aria-current={isActive(only.href) ? "page" : undefined}
            >
              {only.label}
            </Link>
          );
        }

        const groupActive = group.items.some((i) => isActive(i.href));
        return (
          <details key={group.label} open={groupActive} className="relative">
            <summary
              className={`cursor-pointer list-none ${
                groupActive ? "font-semibold text-blue-700" : "font-medium text-neutral-600"
              }`}
            >
              {group.label}
            </summary>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 ps-3">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={linkClass(item.href)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        );
      })}
    </nav>
  );
}
