import { getTranslations } from "next-intl/server";
import { Card, Field, Select, SubmitButton, TextInput } from "../../../../../components/fields";
import { CategoryPicker, type PickerCategory } from "../../../../../components/operations/category-picker";
import { upsertCategoryAction } from "../../../../../lib/actions/operations-actions";

/**
 * M42b — the category tree, extracted from `operations/page.tsx` and moved to the
 * top-level `/transactions`.
 *
 * The tree is the SCHEME that classifies the rows in the list next to it, and the thing
 * the suspense queue assigns from. Keeping the three on one page is the whole argument
 * for `/transactions` existing: they are one subject, not three.
 */

const BEHAVIORAL = [
  "FIXED_CONTRACTUAL",
  "VARIABLE_DISCRETIONARY",
  "FINANCIAL_DRAG",
  "SAVINGS_FLOW",
  "TRANSFER",
] as const;

export interface FlatCategory {
  id: string;
  key: string;
  axis: string;
  nameEn: string;
  nameHe: string;
  defaultBehavioralClass: string;
}

export interface CategoryTreeSectionProps {
  flat: FlatCategory[];
  pickerCats: PickerCategory[];
  locale: string;
}

export async function CategoryTreeSection({ flat, pickerCats, locale }: CategoryTreeSectionProps) {
  const t = await getTranslations("operations");

  return (
    <Card title={t("categories")}>
      <p className="mb-4 text-xs text-neutral-500">{t("categoriesHint", { count: flat.length })}</p>
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        {(["EXPENSE", "INCOME"] as const).map((axis) => (
          <div key={axis}>
            <h3 className="mb-2 text-sm font-semibold">{t(`axis.${axis}`)}</h3>
            <ul className="text-sm">
              {flat.filter((c) => c.axis === axis).map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b border-neutral-100 py-1">
                  {/* Depth from the dotted key, so the tree reads as a tree without a
                      client component. paddingInlineStart keeps it correct in RTL. */}
                  <span style={{ paddingInlineStart: `${(c.key.split(".").length - 1) * 12}px` }}>
                    {locale === "he" ? c.nameHe : c.nameEn}
                  </span>
                  <span className="text-xs text-neutral-400">{t(`behavioralClass.${c.defaultBehavioralClass}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <form action={upsertCategoryAction} className="grid max-w-4xl grid-cols-2 items-end gap-4 md:grid-cols-3">
        <input type="hidden" name="locale" value={locale} />
        <Field label={t("axisLabel")}>
          <Select name="axis" defaultValue="EXPENSE">
            <option value="EXPENSE">{t("axis.EXPENSE")}</option>
            <option value="INCOME">{t("axis.INCOME")}</option>
          </Select>
        </Field>
        <Field label={t("parent")}>
          <CategoryPicker
            name="parent"
            categories={pickerCats}
            locale={locale}
            placeholder={t("noParent")}
            listId="cats-all"
          />
        </Field>
        <Field label={t("categoryKey")}>
          <TextInput name="key" required placeholder="food.bakery" />
        </Field>
        <Field label={t("nameEn")}><TextInput name="nameEn" required /></Field>
        <Field label={t("nameHe")}><TextInput name="nameHe" required /></Field>
        <Field label={t("behavioral")}>
          <Select name="defaultBehavioralClass" defaultValue="VARIABLE_DISCRETIONARY">
            {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
          </Select>
        </Field>
        <SubmitButton label={t("addCategory")} />
      </form>
    </Card>
  );
}
