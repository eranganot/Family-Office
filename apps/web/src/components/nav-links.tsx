"use client";

import { Link, usePathname } from "../i18n/navigation";

export interface NavItem {
  href: string;
  label: string;
}

/** Top navigation with active-tab indication (client — needs the pathname). */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className="mb-6 flex flex-wrap gap-4 border-b border-neutral-200 pb-3 text-sm">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            isActive(item.href)
              ? "-mb-[13px] border-b-2 border-blue-600 pb-[11px] font-semibold text-blue-700"
              : "font-medium text-neutral-600 hover:text-neutral-900 hover:underline"
          }
          aria-current={isActive(item.href) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
