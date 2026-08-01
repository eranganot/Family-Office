import { getTranslations } from "next-intl/server";
import { formatMoney, type Locale } from "@wealthos/i18n";
import { Card, TextInput } from "../../../../../components/fields";
import { BehavioralBars, CategoryTable, SurplusWaterfall } from "../../../../../components/operations/dual-axis";
import {
  closePeriodAction,
  recomputePeriodAction,
  reopenPeriodAction,
} from "../../../../../lib/actions/operations-actions";

/**
 * M42b — the operating-month overview, extracted from `operations/page.tsx` and moved to
 * `/operations/month`. The largest of the ten sections, and the one whose cadence is
 * most obviously monthly rather than daily: month navigation, close/reopen, the surplus
 * waterfall, safe-to-spend, the diagnostics drawer and working capital.
 *
 * Every link inside still points at `/operations/month`, because month navigation that
 * bounced back to Today would make the section unusable at its own route.
 */

const BEHAVIORAL = [
  "FIXED_CONTRACTUAL",
  "VARIABLE_DISCRETIONARY",
  "FINANCIAL_DRAG",
  "SAVINGS_FLOW",
  "TRANSFER",
] as const;

export type FlowResult =
  | {
      ok: true;
      incomeBase: number;
      expensesBase: number;
      leakageBase: number;
      savingsFlowsBase: number;
      transfersExcludedBase: number;
      unverifiedCount: number;
      unverifiedAmountBase: number;
      coverage: string;
      pendingCount: number;
      pendingAmountBase: number;
      /*
       * The engine's `BehavioralTotals` has these five keys and NO index signature, so
       * `Record<string, number>` is not a valid widening of it — TS rejected exactly
       * that. Mirroring the concrete shape keeps this section decoupled from the engine
       * package while still accepting what `computePeriod` actually returns.
       */
      byBehavioral: {
        FIXED_CONTRACTUAL: number;
        VARIABLE_DISCRETIONARY: number;
        FINANCIAL_DRAG: number;
        SAVINGS_FLOW: number;
        TRANSFER: number;
      };
      byCategory: Array<{ categoryId: string; categoryKey: string; amountBase: number }>;
    }
  | { ok: false; reason: string };

export type SurplusResult = { ok: true; monthlyBase: number } | { ok: false; reason: string };

export type SafeToSpendResult =
  | { ok: true; safeToSpendBase: number; windowDays: number; pendingCommittedBase: number }
  | { ok: false; reason: string };

export interface DiagnosticsView {
  total: number;
  booked: number;
  pending: number;
  voided: number;
  inflow: number;
  inflowTotal: number;
  transfers: number;
  transferTotal: number;
  savings: number;
  missingBase: number;
  rows: Array<{
    id: string;
    date: string;
    amount: number;
    description: string;
    behavioral: string | null;
    category: string | null;
    status: string;
    hasBase: boolean;
  }>;
}

export interface MonthOverviewSectionProps {
  year: number;
  month: number;
  locale: string;
  loc: Locale;
  baseCurrency: string;
  availableMonths: Array<{ year: number; month: number; count: number }>;
  periodRow: { status: string; reviewSnapshotId: string | null } | null;
  flow: FlowResult;
  surplus: SurplusResult;
  sts: SafeToSpendResult;
  committedInstalmentsBase: number;
  workingCapital: { availableBase: number; targetBase: number; gapBase: number };
  diag: DiagnosticsView | null;
  /** Category id → display names, for the by-category table. */
  byId: Map<string, { nameEn: string; nameHe: string }>;
}

export async function MonthOverviewSection({
  year,
  month,
  locale,
  loc,
  baseCurrency,
  availableMonths,
  periodRow,
  flow,
  surplus,
  sts,
  committedInstalmentsBase,
  workingCapital,
  diag,
  byId,
}: MonthOverviewSectionProps) {
  const t = await getTranslations("operations");
  const base = `/${locale}/operations/month`;

  return (
    <Card title={t("monthTitle", { month: String(month).padStart(2, "0"), year })}>
      {/* Month navigation: previous / next plus every month that actually has data. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(() => {
          const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
          const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
          return (
            <>
              <a href={`${base}?y=${prev.y}&m=${prev.m}`} className="rounded-lg border border-neutral-300 px-3 py-1.5">
                ← {String(prev.m).padStart(2, "0")}/{prev.y}
              </a>
              <a href={base} className="rounded-lg border border-neutral-300 px-3 py-1.5">
                {t("thisMonth")}
              </a>
              <a href={`${base}?y=${next.y}&m=${next.m}`} className="rounded-lg border border-neutral-300 px-3 py-1.5">
                {String(next.m).padStart(2, "0")}/{next.y} →
              </a>
            </>
          );
        })()}
        {availableMonths.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
            <span className="ms-2">{t("monthsWithData")}:</span>
            {availableMonths.map((mm) => {
              const active = mm.year === year && mm.month === month;
              return (
                <a
                  key={`${mm.year}-${mm.month}`}
                  href={`${base}?y=${mm.year}&m=${mm.month}`}
                  className={active ? "rounded bg-blue-600 px-2 py-0.5 text-white" : "rounded bg-neutral-100 px-2 py-0.5 text-blue-700"}
                >
                  {String(mm.month).padStart(2, "0")}/{mm.year} ({mm.count})
                </a>
              );
            })}
          </span>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action={recomputePeriodAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
            {t("recompute")}
          </button>
        </form>
        {periodRow?.status === "CLOSED" ? (
          <form action={reopenPeriodAction} className="flex items-center gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium">{t("periodClosed")}</span>
            {/*
              M41 — whether the monthly review actually recorded a snapshot. Shown because
              the review is deliberately NON-FATAL to the close: a failed snapshot leaves
              the month closed with reviewSnapshotId null, and without this the difference
              is invisible. A closed month that says nothing about its review looks
              identical to one that reviewed successfully.
            */}
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                periodRow.reviewSnapshotId
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {periodRow.reviewSnapshotId ? t("reviewPinned") : t("reviewNotPinned")}
            </span>
            <button type="submit" className="text-xs text-blue-600 underline">{t("reopen")}</button>
          </form>
        ) : (
          <form action={closePeriodAction} className="flex items-center gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <TextInput name="reviewNote" placeholder={t("reviewNotePlaceholder")} maxLength={2000} />
            <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">{t("closeMonth")}</button>
          </form>
        )}
      </div>

      {!flow.ok ? (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">{t("cannotCompute")}</p>
          <p className="mt-1">{t(`refusal.${flow.reason}`)}</p>
        </div>
      ) : (
        <>
          {flow.unverifiedCount > 0 ? (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("provisionalBanner", {
                count: flow.unverifiedCount,
                amount: formatMoney(flow.unverifiedAmountBase, baseCurrency, loc),
              })}
            </p>
          ) : null}
          {flow.coverage !== "COMPLETE" ? (
            <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
              {t(`coverage.${flow.coverage}`)}
            </p>
          ) : null}

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">{t("surplusTitle")}</h3>
              <SurplusWaterfall
                locale={loc}
                currency={baseCurrency}
                steps={[
                  { key: "income", label: t("netIncome"), amount: flow.incomeBase, kind: "in" },
                  { key: "fixed", label: t("behavioralClass.FIXED_CONTRACTUAL"), amount: flow.byBehavioral.FIXED_CONTRACTUAL, kind: "out" },
                  { key: "var", label: t("behavioralClass.VARIABLE_DISCRETIONARY"), amount: flow.byBehavioral.VARIABLE_DISCRETIONARY, kind: "out" },
                  { key: "drag", label: t("behavioralClass.FINANCIAL_DRAG"), amount: flow.leakageBase, kind: "out" },
                  { key: "debt", label: t("debtService"), amount: Math.max(0, flow.incomeBase - flow.expensesBase - (surplus.ok ? surplus.monthlyBase : 0)), kind: "out" },
                  { key: "surplus", label: t("verifiedSurplus"), amount: surplus.ok ? surplus.monthlyBase : 0, kind: "result" },
                ]}
              />
              {flow.pendingCount > 0 ? (
                <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  {t("pendingLine", {
                    n: flow.pendingCount,
                    amount: formatMoney(flow.pendingAmountBase, baseCurrency, loc),
                  })}
                </p>
              ) : null}
              {!surplus.ok ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t(`refusal.${surplus.reason}`)}</p>
              ) : null}
              <p className="mt-3 text-xs text-neutral-500">{t("savingsNote", { amount: formatMoney(flow.savingsFlowsBase, baseCurrency, loc) })}</p>
              {flow.transfersExcludedBase > 0 ? (
                <p className="mt-1 text-xs text-neutral-500">{t("transfersNote", { amount: formatMoney(flow.transfersExcludedBase, baseCurrency, loc) })}</p>
              ) : null}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold">{t("behavioralTitle")}</h3>
              <BehavioralBars
                // Cast restored from the original: BehavioralBars takes an indexable
                // map, and BehavioralTotals has no index signature.
                totals={flow.byBehavioral as unknown as Record<string, number>}
                labels={Object.fromEntries(BEHAVIORAL.map((b) => [b, t(`behavioralClass.${b}`)]))}
                locale={loc}
                currency={baseCurrency}
              />
              <h3 className="mt-6 mb-3 text-sm font-semibold">{t("safeToSpendTitle")}</h3>
              {sts.ok ? (
                <>
                  <p className="text-2xl font-semibold tabular-nums">{formatMoney(sts.safeToSpendBase, baseCurrency, loc)}</p>
                  <p className="mt-1 text-xs text-neutral-500">{t("safeToSpendHint", { days: sts.windowDays })}</p>
                  {sts.pendingCommittedBase > 0 ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      {t("safeToSpendPending", { amount: formatMoney(sts.pendingCommittedBase, baseCurrency, loc) })}
                    </p>
                  ) : null}
                  {committedInstalmentsBase > 0 ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      {t("instalmentsCommitted", { amount: formatMoney(committedInstalmentsBase, baseCurrency, loc) })}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t(`refusal.${sts.reason}`)}</p>
              )}
            </div>
          </div>

          {diag ? (
            <details className="mt-6 rounded-lg bg-neutral-50 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium text-neutral-700">
                {t("diagTitle", { n: diag.total })}
              </summary>
              <p className="mt-2 text-neutral-600">{t("diagHint")}</p>
              <p className="mt-2 font-mono">
                {t("diagSummary", {
                  booked: diag.booked, pending: diag.pending, voided: diag.voided,
                  inflow: diag.inflow, inflowTotal: diag.inflowTotal.toFixed(2),
                  transfers: diag.transfers, transferTotal: diag.transferTotal.toFixed(2),
                  savings: diag.savings, missingBase: diag.missingBase,
                })}
              </p>
              <table className="mt-3 w-full">
                <thead>
                  <tr className="text-neutral-500">
                    <th className="text-start">{t("date")}</th>
                    <th className="text-start">{t("amount")}</th>
                    <th className="text-start">{t("description")}</th>
                    <th className="text-start">{t("behavioral")}</th>
                    <th className="text-start">{t("category")}</th>
                    <th className="text-start">{t("diagCounted")}</th>
                  </tr>
                </thead>
                <tbody>
                  {diag.rows.map((r) => {
                    const excluded =
                      r.status !== "BOOKED" || r.behavioral === "TRANSFER" || !r.hasBase;
                    return (
                      <tr key={r.id} className={excluded ? "text-neutral-400" : ""}>
                        <td className="whitespace-nowrap">{r.date}</td>
                        <td className={`tabular-nums ${r.amount > 0 ? "text-green-700" : ""}`}>{r.amount.toFixed(2)}</td>
                        <td className="max-w-56 truncate">{r.description}</td>
                        <td>{r.behavioral ? t(`behavioralClass.${r.behavioral}`) : "—"}</td>
                        <td>{r.category ?? "—"}</td>
                        <td>
                          {r.status !== "BOOKED"
                            ? t("diagNotBooked", { status: r.status })
                            : !r.hasBase
                              ? t("diagNoRate")
                              : r.behavioral === "TRANSFER"
                                ? t("diagTransfer")
                                : r.behavioral === "SAVINGS_FLOW"
                                  ? t("diagSavings")
                                  : t("diagYes")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          ) : null}

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">{t("byCategoryTitle")}</h3>
              <CategoryTable
                locale={loc}
                currency={baseCurrency}
                emptyLabel={t("noCategoryTotals")}
                rows={flow.byCategory.slice(0, 12).map((c) => ({
                  categoryId: c.categoryId,
                  label: (() => {
                    const m = byId.get(c.categoryId);
                    return m ? (locale === "he" ? m.nameHe : m.nameEn) : c.categoryKey;
                  })(),
                  amountBase: c.amountBase,
                }))}
              />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">{t("workingCapitalTitle")}</h3>
              <ul className="text-sm">
                <li className="flex justify-between border-b border-neutral-100 py-1.5">
                  <span>{t("wcAvailable")}</span>
                  <span className="tabular-nums">{formatMoney(workingCapital.availableBase, baseCurrency, loc)}</span>
                </li>
                <li className="flex justify-between border-b border-neutral-100 py-1.5">
                  <span>{t("wcTarget")}</span>
                  <span className="tabular-nums">{formatMoney(workingCapital.targetBase, baseCurrency, loc)}</span>
                </li>
                <li className="flex justify-between py-1.5 font-medium">
                  <span>{t("wcGap")}</span>
                  <span className={`tabular-nums ${workingCapital.gapBase > 0 ? "text-amber-700" : "text-green-700"}`}>
                    {formatMoney(workingCapital.gapBase, baseCurrency, loc)}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
