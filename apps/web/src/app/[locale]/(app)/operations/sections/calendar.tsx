import { getTranslations } from "next-intl/server";
import { formatMoney, type Locale } from "@wealthos/i18n";
import { Card, SubmitButton, SuccessBanner } from "../../../../../components/fields";
import {
  SUGGESTED_DATE_RATIONALE,
  nextOccurrenceForDecision,
  suggestedAnchorDate,
} from "@wealthos/domain";
import {
  applySuggestedDateAction,
  regenerateCalendarAction,
  setCalendarStatusAction,
  upsertRecurringAction,
} from "../../../../../lib/actions/operations-actions";

/**
 * M42b — the financial calendar and its recurring decisions, extracted from
 * `operations/page.tsx`. Behaviour-preserving move; see `action-center.tsx` for why
 * extraction and restructuring are separate commits.
 *
 * Calendar and recurring stay TOGETHER and move to `/operations/calendar` as one unit.
 * They are two views of the same fact: a recurring decision is the rule, the calendar
 * events are what that rule produces. Splitting them would leave the owner editing an
 * anchor date on one page and looking for its effect on another.
 *
 * Only the DUE-SOON items belong on Today, as compact rows — not this whole table.
 */

export interface CalendarEventRow {
  id: string;
  dueDate: string;
  daysAway: number;
  titleEn: string;
  titleHe: string;
  kind: string;
  amountBase: number | null;
}

export interface RecurringRow {
  id: string;
  key: string;
  titleEn: string;
  titleHe: string;
  anchorDate: Date;
  cadence: string;
  isActive: boolean;
}

export interface CalendarSectionProps {
  /** `null` = never built. Distinct from "built and empty in this window". */
  calendar: { events: CalendarEventRow[]; cashImpactBase: number } | null;
  recurring: RecurringRow[];
  /** Currently selected look-ahead window, for highlighting the active link. */
  calWindow: number;
  locale: string;
  loc: Locale;
  baseCurrency: string;
  builtMessage?: string | undefined;
  savedMessage?: string | undefined;
  suggestionsMessage?: string | undefined;
}

export async function CalendarSection({
  calendar,
  recurring,
  calWindow,
  locale,
  loc,
  baseCurrency,
  builtMessage,
  savedMessage,
  suggestionsMessage,
}: CalendarSectionProps) {
  const t = await getTranslations("operations");
  const tf = await getTranslations("forms");

  return (
    <Card title={t("calendarTitle")}>
      <p className="mb-4 text-xs text-neutral-500">{t("calendarHint")}</p>

      <SuccessBanner message={builtMessage} />
      <SuccessBanner message={savedMessage} />
      <SuccessBanner message={suggestionsMessage} />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <form action={regenerateCalendarAction}>
          <input type="hidden" name="locale" value={locale} />
          <SubmitButton label={t("calendarRebuild")} />
        </form>
        <span className="text-xs text-neutral-500">{t("windowLabel")}</span>
        {[60, 120, 400].map((d) => (
          <a
            key={d}
            href={`?cw=${d}#calendar`}
            className={`text-xs underline ${d === calWindow ? "font-semibold text-neutral-900" : "text-blue-700"}`}
          >
            {t("windowDays", { n: d })}
          </a>
        ))}
      </div>

      {calendar && calendar.events.length > 0 ? (
        <>
          <p className="mb-2 text-xs text-neutral-500">
            {t("calendarCashImpact", {
              amount: formatMoney(calendar.cashImpactBase, baseCurrency, loc),
            })}
          </p>
          <table className="w-full text-start text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-2 text-start">{t("colDue")}</th>
                <th className="py-2 text-start" />
                <th className="py-2 text-start">{t("colEvent")}</th>
                <th className="py-2 text-start">{t("colKind")}</th>
                <th className="py-2 text-end">{t("colAmount")}</th>
                <th className="py-2 text-end">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {calendar.events.map((e) => (
                <tr key={e.id} className="border-b border-neutral-100">
                  <td className="py-2 tabular-nums" dir="ltr">{e.dueDate}</td>
                  <td className="py-2">
                    {/* Overdue reads red, imminent amber. Proximity is the signal here,
                        not amount — a small statutory date that closes this week
                        outranks a large one two months out. */}
                    <span
                      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                        e.daysAway < 0
                          ? "bg-red-50 text-red-700"
                          : e.daysAway <= 14
                            ? "bg-amber-50 text-amber-700"
                            : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {e.daysAway === 0
                        ? t("dueToday")
                        : e.daysAway < 0
                          ? t("daysAgo", { n: Math.abs(e.daysAway) })
                          : t("daysAway", { n: e.daysAway })}
                    </span>
                  </td>
                  <td className="py-2">{loc === "he" ? e.titleHe : e.titleEn}</td>
                  <td className="py-2 text-xs text-neutral-500">{t(`calendarKind.${e.kind}`)}</td>
                  <td className="py-2 text-end tabular-nums">
                    {e.amountBase === null ? "—" : formatMoney(e.amountBase, baseCurrency, loc)}
                  </td>
                  <td className="py-2 text-end">
                    <form action={setCalendarStatusAction} className="inline">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="status" value="DONE" />
                      <button type="submit" className="text-xs text-emerald-700 underline">
                        {t("markDone")}
                      </button>
                    </form>
                    <form action={setCalendarStatusAction} className="ms-3 inline">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="status" value="SKIPPED" />
                      <button type="submit" className="text-xs text-neutral-500 underline">
                        {t("markSkipped")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-sm text-neutral-500">
          {calendar ? t("calendarEmptyWindow") : t("calendarEmpty")}
        </p>
      )}

      <h3 className="mt-8 mb-2 text-sm font-semibold">{t("recurringTitle")}</h3>
      <p className="mb-1 text-xs text-neutral-500">{t("recurringHint")}</p>
      <p className="mb-2 text-xs text-neutral-500">{t("suggestedDates")}</p>
      <form action={applySuggestedDateAction} className="mb-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="key" value="" />
        <SubmitButton label={t("applyAllSuggested")} />
      </form>
      <table className="w-full text-start text-sm">
        <tbody>
          {recurring.map((r) => (
            <tr key={r.id} className="border-b border-neutral-100">
              <td className="py-2 align-top">
                {loc === "he" ? r.titleHe : r.titleEn}
                {(() => {
                  const why = SUGGESTED_DATE_RATIONALE[r.key];
                  return why ? (
                    <p className="mt-1 max-w-md text-xs font-normal text-neutral-400">
                      {loc === "he" ? why.he : why.en}
                    </p>
                  ) : null;
                })()}
              </td>
              <td className="py-2">
                <form action={upsertRecurringAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="key" value={r.key} />
                  <input
                    type="date"
                    name="anchorDate"
                    defaultValue={r.anchorDate.toISOString().slice(0, 10)}
                    className="rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs text-neutral-600">
                    <input type="checkbox" name="isActive" defaultChecked={r.isActive} />
                    {t("recurringActive")}
                  </label>
                  <button type="submit" className="text-xs text-blue-700 underline">
                    {tf("save")}
                  </button>
                </form>
                {(() => {
                  const nxt = nextOccurrenceForDecision(r.anchorDate, r.cadence as never);
                  return nxt ? (
                    <p className="mt-1 text-xs text-neutral-600">
                      {t("nextFires", { date: nxt.toISOString().slice(0, 10) })}
                    </p>
                  ) : null;
                })()}
                {(() => {
                  const sug = suggestedAnchorDate(r.key, new Date().getUTCFullYear());
                  if (!sug) return null;
                  const sugIso = sug.toISOString().slice(0, 10);
                  if (sugIso === r.anchorDate.toISOString().slice(0, 10)) {
                    return <p className="mt-1 text-xs text-emerald-700">{t("matchesSuggestion")}</p>;
                  }
                  return (
                    <form action={applySuggestedDateAction} className="mt-1 flex items-center gap-2">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="key" value={r.key} />
                      <span className="text-xs text-neutral-500" dir="ltr">
                        {t("suggestedIs", { date: sugIso })}
                      </span>
                      <button type="submit" className="text-xs text-blue-700 underline">
                        {t("applySuggested")}
                      </button>
                    </form>
                  );
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
