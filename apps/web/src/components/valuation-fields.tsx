import { getTranslations } from "next-intl/server";
import { Field, TextInput } from "./fields";

/** Optional initial valuation block: value, date, confidence. */
export async function ValuationFields() {
  const t = await getTranslations("forms");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label={t("value")}>
        <TextInput name="value" inputMode="decimal" placeholder="0.00" />
      </Field>
      <Field label={t("valueDate")}>
        <TextInput name="valueDate" type="date" defaultValue={today} />
      </Field>
      <Field label={t("confidence")}>
        <TextInput name="confidence" type="number" min={0} max={100} defaultValue={70} />
      </Field>
    </div>
  );
}
