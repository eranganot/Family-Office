import { getTranslations } from "next-intl/server";
import { formatMoney, type Locale } from "@wealthos/i18n";
import { Card, Field, Select, SubmitButton, TextInput } from "../../../../../components/fields";
import { CategoryPicker, type PickerCategory } from "../../../../../components/operations/category-picker";
import {
  removeDuplicatesAction,
  setTransactionStatusAction,
  updateTransactionAction,
} from "../../../../../lib/actions/operations-actions";
import type { FlatCategory } from "./category-tree";

/**
 * M42b — the transaction list, extracted from `operations/page.tsx` and moved to the
 * top-level `/transactions`.
 *
 * Every self-link now points at `/transactions` rather than `/operations`: the filter
 * form, the clear-filter link, the edit / cancel links. A row edited here that bounced
 * back to Today would drop the owner on a page where the row is not shown, which is the
 * same bug the calendar and month redirects had.
 */

const BEHAVIORAL = [
  "FIXED_CONTRACTUAL",
  "VARIABLE_DISCRETIONARY",
  "FINANCIAL_DRAG",
  "SAVINGS_FLOW",
  "TRANSFER",
] as const;

export interface TransactionRow {
  id: string;
  descriptionRedacted: string;
  bookedAt: string | Date;
  amount: unknown;
  currency: string;
  status: string;
  categoryId: string | null;
  behavioralClass: string | null;
  instalmentNumber: number | null;
  instalmentTotal: number | null;
  isRecurringCandidate: boolean;
  classifications: Array<{
    method: string;
    confidence: unknown;
    decidedBy: string | null;
    ruleVersion: string | null;
  }>;
}

export interface DuplicatesView {
  extraRows: number;
  extraAmount: number;
  groups: unknown[];
}

export interface TransactionListSectionProps {
  txns: TransactionRow[];
  flat: FlatCategory[];
  pickerCats: PickerCategory[];
  byId: Map<string, { nameEn: string; nameHe: string }>;
  dupes: DuplicatesView | null;
  locale: string;
  loc: Locale;
  baseCurrency: string;
  /** Active filters + the row being edited, all driven by search params. */
  filterCat?: string | undefined;
  filterBeh?: string | undefined;
  editingId?: string | undefined;
  /** Voided rows are hidden by default — a resolved duplicate should not look unresolved. */
  showVoided?: boolean | undefined;
}

export async function TransactionListSection({
  txns,
  flat,
  pickerCats,
  byId,
  dupes,
  locale,
  loc,
  baseCurrency,
  filterCat,
  filterBeh,
  editingId,
  showVoided = false,
}: TransactionListSectionProps) {
  const t = await getTranslations("operations");
  const base = `/${locale}/transactions`;

  /*
   * QA: clicking "edit" cleared the active filter, so the owner lost his place and had
   * to re-filter after every correction — on a list where correcting rows IS the task.
   * Every self-link now carries the filter forward; only `edit` changes.
   */
  const keep = new URLSearchParams();
  if (filterCat) keep.set("cat", filterCat);
  if (filterBeh) keep.set("beh", filterBeh);
  const withFilters = (extra?: Record<string, string>): string => {
    const p = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
    const q = p.toString();
    return q ? `${base}?${q}` : base;
  };

  return (
    <Card title={t("transactions")}>
      <p className="mb-3 text-xs text-neutral-500">{t("transactionsHint")}</p>

      {dupes && dupes.extraRows > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            {t("dupesFound", {
              n: dupes.extraRows,
              groups: dupes.groups.length,
              amount: formatMoney(dupes.extraAmount, baseCurrency, loc),
            })}
          </span>
          <form action={removeDuplicatesAction}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white">
              {t("dupesRemove")}
            </button>
          </form>
        </div>
      ) : null}

      {/* Filter by category / behaviour — GET links so a filtered view is linkable. */}
      <form method="get" action={base} className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t("filterCategory")}>
          <Select name="cat" defaultValue={filterCat ?? ""}>
            <option value="">{t("filterAll")}</option>
            {flat.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === "he" ? c.nameHe : c.nameEn}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("filterBehavioral")}>
          <Select name="beh" defaultValue={filterBeh ?? ""}>
            <option value="">{t("filterAll")}</option>
            {BEHAVIORAL.map((b) => (
              <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>
            ))}
          </Select>
        </Field>
        {/*
          QA: the list showed the same mortgage row twice — an active copy and the VOID
          copy that `removeDuplicates` created. Voided rows are excluded from every
          calculation already, so showing them by default made a resolved duplicate look
          like an unresolved one. They are hidden unless asked for, never deleted: a
          voided row is recoverable, which is the whole reason dedupe voids rather than
          deletes.
        */}
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" name="void" value="1" defaultChecked={showVoided} />
          {t("filterShowVoided")}
        </label>
        <SubmitButton label={t("filterApply")} />
        {filterCat || filterBeh || showVoided ? (
          <a href={base} className="text-xs text-blue-600 underline">
            {t("filterClear")}
          </a>
        ) : null}
      </form>

      {(() => {
        const visible = showVoided ? txns : txns.filter((tx) => tx.status !== "VOID");
        const hidden = txns.length - visible.length;
        return hidden > 0 ? (
          <p className="mb-3 text-xs text-neutral-500">{t("voidedHidden", { n: hidden })}</p>
        ) : null;
      })()}

      {(showVoided ? txns : txns.filter((tx) => tx.status !== "VOID")).length === 0 ? (
        /*
          QA: a filter matching nothing showed "no transactions yet — add one above",
          which reads as "this household has no data". Distinguish the two: an empty
          FILTER is a filter result, and the way out is to clear it, not to start typing.
        */
        <p className="text-sm text-neutral-500">
          {filterCat || filterBeh ? t("noTransactionsForFilter") : t("noTransactions")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {(showVoided ? txns : txns.filter((tx) => tx.status !== "VOID")).map((tx) => {
            const cat = tx.categoryId ? byId.get(tx.categoryId) : undefined;
            const amount = Number(tx.amount);
            const cls = tx.classifications[0];
            const isEditing = editingId === tx.id;
            const voided = tx.status === "VOID";
            return (
              <div
                id={`tx-${tx.id}`}
                key={tx.id}
                className={`rounded-xl border p-4 ${voided ? "border-neutral-200 bg-neutral-50 opacity-60" : "border-neutral-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span>{tx.descriptionRedacted}</span>
                      {voided ? (
                        <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600">{t("removedBadge")}</span>
                      ) : null}
                      {tx.instalmentTotal ? (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                          {t("instalmentBadge", { n: tx.instalmentNumber ?? 1, total: tx.instalmentTotal })}
                        </span>
                      ) : null}
                      {tx.isRecurringCandidate ? (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{t("recurringBadge")}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {new Date(tx.bookedAt).toISOString().slice(0, 10)}
                      {" · "}
                      {cat ? (locale === "he" ? cat.nameHe : cat.nameEn) : t("unclassifiedBadge")}
                      {tx.behavioralClass ? ` · ${t(`behavioralClass.${tx.behavioralClass}`)}` : ""}
                    </p>
                    {/* Provenance: why does this row have this category? */}
                    {cls ? (
                      <p className="mt-1 text-xs text-neutral-400">
                        {t("provenance", {
                          method: t(`method.${cls.method}`),
                          confidence: Math.round(Number(cls.confidence) * 100),
                        })}
                        {cls.decidedBy ? ` · ${cls.decidedBy}` : ""}
                        {cls.ruleVersion ? ` · ${cls.ruleVersion}` : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-400">{t("provenanceNone")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`whitespace-nowrap tabular-nums ${amount < 0 ? "text-neutral-800" : "text-green-700"}`}>
                      {formatMoney(Math.abs(amount), tx.currency, loc)}
                    </span>
                    {isEditing ? (
                      <a href={withFilters()} className="text-xs text-neutral-500 underline">{t("cancel")}</a>
                    ) : (
                      <a
                        href={`${withFilters({ edit: tx.id })}#tx-${tx.id}`}
                        className="text-xs text-blue-600 underline"
                      >
                        {t("edit")}
                      </a>
                    )}
                    <form action={setTransactionStatusAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={tx.id} />
                      <input type="hidden" name="status" value={voided ? "BOOKED" : "VOID"} />
                      <button type="submit" className="text-xs text-neutral-500 underline">
                        {voided ? t("restore") : t("remove")}
                      </button>
                    </form>
                  </div>
                </div>

                {isEditing ? (
                  <form action={updateTransactionAction} className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-neutral-100 pt-4 md:grid-cols-4">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={tx.id} />
                    <Field label={t("date")}>
                      <TextInput name="bookedAt" type="date" defaultValue={new Date(tx.bookedAt).toISOString().slice(0, 10)} required />
                    </Field>
                    <Field label={t("direction")}>
                      <Select name="direction" defaultValue={amount < 0 ? "OUT" : "IN"}>
                        <option value="OUT">{t("directionOut")}</option>
                        <option value="IN">{t("directionIn")}</option>
                      </Select>
                    </Field>
                    <Field label={t("amount")}>
                      <TextInput name="amount" inputMode="decimal" defaultValue={Math.abs(amount)} required />
                    </Field>
                    <Field label={t("currency")}>
                      <Select name="currency" defaultValue={tx.currency}>
                        {["ILS", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </Field>
                    <Field label={t("description")}>
                      <TextInput name="description" defaultValue={tx.descriptionRedacted} required maxLength={400} />
                    </Field>
                    <Field label={t("category")}>
                      <CategoryPicker
                        name="category"
                        categories={pickerCats}
                        locale={locale}
                        defaultCategoryId={tx.categoryId}
                        placeholder={t("categoryOrPick")}
                        listId="cats-all"
                      />
                    </Field>
                    <Field label={t("behavioral")}>
                      <Select name="behavioralClass" defaultValue={tx.behavioralClass ?? ""}>
                        <option value="">{t("behavioralFromCategory")}</option>
                        {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
                      </Select>
                    </Field>
                    <Field label={t("instalmentNumber")}>
                      <TextInput name="instalmentNumber" inputMode="numeric" defaultValue={tx.instalmentNumber ?? ""} />
                    </Field>
                    <Field label={t("instalmentTotal")}>
                      <TextInput name="instalmentTotal" inputMode="numeric" defaultValue={tx.instalmentTotal ?? ""} />
                    </Field>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="isRecurringCandidate" defaultChecked={tx.isRecurringCandidate} />
                      <span className="text-neutral-600">{t("recurring")}</span>
                    </label>
                    <SubmitButton label={t("saveChanges")} />
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
