import { getTranslations } from "next-intl/server";
import type { Locale } from "@wealthos/i18n";
import { Card, SuccessBanner } from "../../../../../components/fields";
import { setActionStatusAction } from "../../../../../lib/actions/operations-actions";

/**
 * M42b — the Action Center, extracted from `operations/page.tsx`.
 *
 * FIRST STEP OF THE `/operations` SPLIT, and deliberately behaviour-preserving: the
 * markup below is the same JSX that lived inline, moved without restyling or changing
 * what it renders. Extraction and restructuring are kept in separate commits so that if
 * something breaks, it is obvious which change did it. The page had grown to ~1,550
 * lines with ten top-level Cards, and rewriting all of it at once — on a mount that
 * silently truncates large writes — is not a debuggable operation.
 *
 * The section fetches its own translations rather than receiving `t` as a prop. Passing
 * a translator down couples every section to the page's namespace choice and makes each
 * one harder to move to its own route later, which is the whole point of doing this.
 *
 * Data still arrives as props: the page owns fetching for now. Narrowing each route to
 * fetch only what it renders comes in the routing step — today `/operations` computes
 * the period, opportunities, actions, EOY, drift, suspense, calendar, categories and
 * transactions on every single load.
 */

export interface ActionRow {
  id: string;
  title: string;
  titleHe: string | null;
  origin: string;
  actionStatus: string;
  isBlocked: boolean;
  blockedByEn: string[];
  blockedByHe: string[];
}

export interface ActionCenterSectionProps {
  actions: { items: ActionRow[]; openCount: number; blockedCount: number } | null;
  /** Route locale, posted back with each form so the action can redirect correctly. */
  locale: string;
  loc: Locale;
  /** Rendered when the previous submit succeeded; undefined otherwise. */
  savedMessage?: string | undefined;
}

export async function ActionCenterSection({
  actions,
  locale,
  loc,
  savedMessage,
}: ActionCenterSectionProps) {
  const t = await getTranslations("operations");

  return (
    <Card title={t("actionsTitle")}>
      <p className="mb-4 text-xs text-neutral-500">{t("actionsHint")}</p>
      <SuccessBanner message={savedMessage} />

      {actions && actions.items.length > 0 ? (
        <>
          <p className="mb-3 text-xs text-neutral-600">
            {t("actionsSummary", { open: actions.openCount, blocked: actions.blockedCount })}
          </p>
          <ul className="divide-y divide-neutral-200">
            {actions.items.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">
                    {loc === "he" ? (a.titleHe ?? a.title) : a.title}
                  </h3>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {t(`actionState.${a.actionStatus}`)}
                  </span>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                    {t(`actionOrigin.${a.origin}`)}
                  </span>
                </div>

                {a.isBlocked ? (
                  /*
                    Reported, never enforced. The owner may know something the engine
                    does not, so the API still accepts the change — the lock exists so
                    that acting out of order is a CHOICE rather than an accident.
                  */
                  <p className="mt-1 text-xs text-amber-700">
                    {t("actionBlockedBy", {
                      items: (loc === "he" ? a.blockedByHe : a.blockedByEn).join(" · "),
                    })}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-3">
                  {(["IN_PROGRESS", "COMPLETED", "PENDING"] as const)
                    .filter((s) => s !== a.actionStatus)
                    .map((s) => (
                      <form key={s} action={setActionStatusAction} className="inline">
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value={s} />
                        <button type="submit" className="text-xs text-emerald-700 underline">
                          {t(`actionAction.${s}`)}
                        </button>
                      </form>
                    ))}

                  {/*
                    A dismissal must carry a reason — the select is `required`.

                    The button comes FIRST in the DOM so that in RTL it renders on the
                    leading side and the reason follows it: "dismiss — because…". With
                    the select first, Hebrew put the dropdown ahead of the verb, which
                    reads as though the reason were being chosen for no stated action.
                    Source order drives this in both directions, so LTR reads the same
                    way round without a direction-specific override.
                  */}
                  <form action={setActionStatusAction} className="inline-flex items-center gap-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="status" value="DISMISSED" />
                    <button type="submit" className="text-xs text-neutral-500 underline">
                      {t("actionAction.DISMISSED")}
                    </button>
                    <select
                      name="dismissalReason"
                      required
                      defaultValue=""
                      className="rounded border border-neutral-300 px-1 py-0.5 text-xs"
                    >
                      <option value="" disabled>
                        {t("actionDismissReasonPrompt")}
                      </option>
                      {(
                        [
                          "NOT_RELEVANT",
                          "TOO_HARD",
                          "DISAGREE",
                          "ALREADY_DONE",
                          "LATER",
                          "OTHER",
                        ] as const
                      ).map((r) => (
                        <option key={r} value={r}>
                          {t(`actionDismissReason.${r}`)}
                        </option>
                      ))}
                    </select>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-neutral-500">{t("actionsEmpty")}</p>
      )}
    </Card>
  );
}
