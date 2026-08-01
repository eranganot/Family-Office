import { getTranslations } from "next-intl/server";
import { Card, Field, Select, SubmitButton, TextInput } from "../../../../../components/fields";
import { CategoryPicker, type PickerCategory } from "../../../../../components/operations/category-picker";
import { createManualTransactionAction } from "../../../../../lib/actions/operations-actions";

/**
 * M42b — manual transaction entry, extracted from `operations/page.tsx` and moved to the
 * top-level `/transactions`.
 *
 * It belongs there rather than on Today because it is part of the CLASSIFICATION layer:
 * the row it creates lands in the same list, under the same category tree, and can end
 * up in the same suspense queue as an imported one.
 */

const BEHAVIORAL = [
  "FIXED_CONTRACTUAL",
  "VARIABLE_DISCRETIONARY",
  "FINANCIAL_DRAG",
  "SAVINGS_FLOW",
  "TRANSFER",
] as const;

export interface ManualAddSectionProps {
  pickerCats: PickerCategory[];
  locale: string;
  /** yyyy-mm-dd, so the date field defaults to today without a client component. */
  today: string;
}

export async function ManualAddSection({ pickerCats, locale, today }: ManualAddSectionProps) {
  const t = await getTranslations("operations");

  return (
    <Card title={t("addTransaction")}>
      <p className="mb-4 text-xs text-neutral-500">{t("addTransactionHint")}</p>
      <form action={createManualTransactionAction} className="grid max-w-4xl grid-cols-2 items-end gap-4 md:grid-cols-3">
        <input type="hidden" name="locale" value={locale} />
        <Field label={t("date")}>
          <TextInput name="bookedAt" type="date" defaultValue={today} required />
        </Field>
        <Field label={t("direction")}>
          <Select name="direction" defaultValue="OUT">
            <option value="OUT">{t("directionOut")}</option>
            <option value="IN">{t("directionIn")}</option>
          </Select>
        </Field>
        <Field label={t("amount")}>
          <TextInput name="amount" inputMode="decimal" required placeholder="0.00" />
        </Field>
        <Field label={t("currency")}>
          <Select name="currency" defaultValue="ILS">
            {["ILS", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={t("description")}>
          <TextInput name="description" required maxLength={400} />
        </Field>
        <Field label={t("category")}>
          <CategoryPicker
            name="category"
            categories={pickerCats}
            locale={locale}
            placeholder={t("categoryOrPick")}
            listId="cats-create"
          />
        </Field>
        <Field label={t("behavioral")}>
          <Select name="behavioralClass" defaultValue="">
            <option value="">{t("behavioralFromCategory")}</option>
            {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("instalmentNumber")}>
          <TextInput name="instalmentNumber" inputMode="numeric" placeholder="1" />
        </Field>
        <Field label={t("instalmentTotal")}>
          <TextInput name="instalmentTotal" inputMode="numeric" placeholder="3" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isRecurringCandidate" />
          <span className="text-neutral-600">{t("recurring")}</span>
        </label>
        <SubmitButton label={t("save")} />
      </form>
    </Card>
  );
}
