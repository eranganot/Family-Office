import { formatMoney, type Locale } from "@wealthos/i18n";

/**
 * Server-rendered, RTL-safe proportion bars. Deliberately CSS-only rather than recharts:
 * these are five numbers, not a chart, and keeping them server-side avoids shipping a
 * client bundle for it. Uses logical properties (inlineSize) so RTL works for free.
 */
const BEHAVIORAL_COLOR: Record<string, string> = {
  FIXED_CONTRACTUAL: "bg-blue-500",
  VARIABLE_DISCRETIONARY: "bg-emerald-500",
  FINANCIAL_DRAG: "bg-red-500",
  SAVINGS_FLOW: "bg-violet-500",
  TRANSFER: "bg-neutral-300",
};

export function BehavioralBars({
  totals,
  labels,
  locale,
  currency,
}: {
  totals: Record<string, number>;
  labels: Record<string, string>;
  locale: Locale;
  currency: string;
}) {
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 text-sm">
          <span className="w-44 shrink-0 text-neutral-600">{labels[k] ?? k}</span>
          <span className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <span
              className={`block h-full rounded-full ${BEHAVIORAL_COLOR[k] ?? "bg-neutral-400"}`}
              style={{ inlineSize: `${Math.max(2, (v / max) * 100)}%` }}
            />
          </span>
          <span className="w-28 shrink-0 text-end tabular-nums">{formatMoney(v, currency, locale)}</span>
        </div>
      ))}
    </div>
  );
}

export function CategoryTable({
  rows,
  locale,
  currency,
  emptyLabel,
}: {
  rows: Array<{ categoryId: string; label: string; amountBase: number }>;
  locale: Locale;
  currency: string;
  emptyLabel: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">{emptyLabel}</p>;
  const total = rows.reduce((s, r) => s + r.amountBase, 0) || 1;
  return (
    <ul className="text-sm">
      {rows.map((r) => (
        <li key={r.categoryId} className="flex items-center justify-between border-b border-neutral-100 py-1.5">
          <span>{r.label}</span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-neutral-400 tabular-nums">
              {Math.round((r.amountBase / total) * 100)}%
            </span>
            <span className="tabular-nums">{formatMoney(r.amountBase, currency, locale)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Net income → fixed → variable → leakage → debt → surplus, as a readable ladder. */
export function SurplusWaterfall({
  steps,
  locale,
  currency,
}: {
  steps: Array<{ key: string; label: string; amount: number; kind: "in" | "out" | "result" }>;
  locale: Locale;
  currency: string;
}) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {steps.map((s) => (
        <li
          key={s.key}
          className={
            s.kind === "result"
              ? "mt-2 flex items-center justify-between border-t border-neutral-300 pt-3 text-base font-semibold"
              : "flex items-center justify-between py-1"
          }
        >
          <span className={s.kind === "out" ? "text-neutral-600" : ""}>{s.label}</span>
          <span
            className={`tabular-nums ${
              s.kind === "out"
                ? "text-neutral-800"
                : s.kind === "in"
                  ? "text-green-700"
                  : s.amount >= 0
                    ? "text-green-700"
                    : "text-red-700"
            }`}
          >
            {s.kind === "out" ? "−" : ""}
            {formatMoney(Math.abs(s.amount), currency, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
