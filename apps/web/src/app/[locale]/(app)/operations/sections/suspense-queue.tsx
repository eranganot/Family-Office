import { getTranslations } from "next-intl/server";
import { formatMoney, type Locale } from "@wealthos/i18n";
import { Card, Field, Select } from "../../../../../components/fields";
import { CategoryPicker, type PickerCategory } from "../../../../../components/operations/category-picker";
import { bulkClassifyMerchantAction } from "../../../../../lib/actions/operations-actions";

/**
 * M42b — the suspense queue, extracted from `operations/page.tsx`.
 * Behaviour-preserving move; see `action-center.tsx` for why extraction and
 * restructuring are separate commits.
 *
 * Destined for the new top-level `/transactions`, alongside the transaction list, the
 * category tree and import — those four are one thing: transactions are the raw rows,
 * the category tree is the scheme that classifies them, suspense is the rows the scheme
 * could not classify, and import is what feeds all three.
 *
 * But the COUNT belongs on Today. Every closed month in this household is
 * `provisional` because of unverified rows, which is what caveats the surplus figure,
 * what makes `allocationHandoffReadiness` refuse, and what weakened the M41 drift
 * baseline. Clearing this queue is the highest-value recurring action the owner has,
 * and burying it eight sections down was itself part of the problem.
 */

const BEHAVIORAL = [
  "FIXED_CONTRACTUAL",
  "VARIABLE_DISCRETIONARY",
  "FINANCIAL_DRAG",
  "SAVINGS_FLOW",
  "TRANSFER",
] as const;

export interface SuspenseRow {
  id: string;
  descriptionRedacted: string;
  bookedAt: string | Date;
  amount: unknown;
  currency: string;
  merchantKey: string | null;
  categoryId: string | null;
  behavioralClass: string | null;
  category: { nameEn: string; nameHe: string } | null;
  classifications: Array<{ confidence: unknown }>;
}

export interface SuspenseQueueSectionProps {
  suspense: { rows: SuspenseRow[]; minConfidence: number };
  pickerCats: PickerCategory[];
  locale: string;
  loc: Locale;
}

export async function SuspenseQueueSection({
  suspense,
  pickerCats,
  locale,
  loc,
}: SuspenseQueueSectionProps) {
  const t = await getTranslations("operations");

  return (
    <Card title={t("suspenseTitle")}>
      <p className="mb-4 text-xs text-neutral-500">
        {t("suspenseHint", { threshold: Math.round(suspense.minConfidence * 100) })}
      </p>
      {suspense.rows.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("suspenseEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {suspense.rows.map((tx) => {
            const cls = tx.classifications[0];
            const amount = Number(tx.amount);
            return (
              <div key={tx.id} className="rounded-xl border border-neutral-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{tx.descriptionRedacted}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {new Date(tx.bookedAt).toISOString().slice(0, 10)}
                      {" · "}
                      {tx.category
                        ? locale === "he"
                          ? tx.category.nameHe
                          : tx.category.nameEn
                        : t("unclassifiedBadge")}
                      {" · "}
                      {t("confidence")}: {Math.round(Number(cls?.confidence ?? 0) * 100)}%
                    </p>
                  </div>
                  {/* The amount was missing entirely - it is the single most useful
                      signal when deciding what a transaction actually was. */}
                  <span
                    className={`shrink-0 text-lg font-semibold tabular-nums ${
                      amount < 0 ? "text-neutral-800" : "text-green-700"
                    }`}
                  >
                    {amount > 0 ? "+" : ""}
                    {formatMoney(Math.abs(amount), tx.currency, loc)}
                  </span>
                </div>

                <form
                  action={bulkClassifyMerchantAction}
                  className="mt-3 flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-3"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="merchantKey" value={tx.merchantKey ?? ""} />
                  <div className="min-w-64 flex-1">
                    <Field label={t("category")}>
                      <CategoryPicker
                        name="category"
                        categories={pickerCats}
                        locale={locale}
                        defaultCategoryId={tx.categoryId}
                        placeholder={t("categoryOrPick")}
                        required
                        listId="cats-all"
                      />
                    </Field>
                  </div>
                  <Field label={t("behavioral")}>
                    <Select
                      name="behavioralClass"
                      defaultValue={tx.behavioralClass ?? "VARIABLE_DISCRETIONARY"}
                    >
                      {BEHAVIORAL.map((b) => (
                        <option key={b} value={b}>
                          {t(`behavioralClass.${b}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {tx.merchantKey ? (
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
                    >
                      {t("applyToMerchant")}
                    </button>
                  ) : (
                    <span className="flex items-center gap-2 whitespace-nowrap text-xs text-neutral-500">
                      {t("noMerchantKey")}
                      <a
                        href={`/${locale}/operations?edit=${tx.id}`}
                        className="text-blue-600 underline"
                      >
                        {t("editInstead")}
                      </a>
                    </span>
                  )}
                </form>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
