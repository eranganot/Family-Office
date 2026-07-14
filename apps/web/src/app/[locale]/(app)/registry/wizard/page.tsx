import { getTranslations } from "next-intl/server";
import { applyWizardAction } from "../../../../../lib/actions/registry-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../../components/fields";

/** M23b — ten plain-language questions; no financial knowledge required. */
const SCALE_QUESTIONS = [
  { name: "spendRigidity", opts: 3 },
  { name: "nagging", opts: 3 },
  { name: "concentrationSensitivity", opts: 3 },
  { name: "israelDependence", opts: 3 },
  { name: "regretType", opts: 3 },
  { name: "homeView", opts: 3 },
  { name: "driftSpeed", opts: 3 },
  { name: "feeImportance", opts: 2 },
  { name: "institutionDependence", opts: 3 },
  { name: "paymentRiseSensitivity", opts: 3 },
  { name: "dataStrictness", opts: 3 },
  { name: "taxablePortfolioAge", opts: 3 },
] as const;

export default async function AssumptionsWizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("registry.wizard");
  const tf = await getTranslations("forms");

  return (
    <Card title={t("title")}>
      <ErrorBanner message={error ? `${tf("error")}: ${decodeURIComponent(error)}` : undefined} />
      <p className="mb-1 text-sm text-neutral-600">{t("intro1")}</p>
      <p className="mb-5 text-xs text-neutral-400">{t("intro2")}</p>
      <form action={applyWizardAction} className="flex max-w-2xl flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />

        <Field label={t("bufferMonths")}>
          <Select name="bufferMonths" defaultValue="6">
            {[3, 6, 9, 12].map((v) => (
              <option key={v} value={v}>{t(`bufferMonths_${v}`)}</option>
            ))}
          </Select>
        </Field>

        {SCALE_QUESTIONS.map((q) => (
          <Field key={q.name} label={t(q.name)}>
            <Select name={q.name} defaultValue="2">
              {Array.from({ length: q.opts }, (_, i) => i + 1).map((v) => (
                <option key={v} value={v}>{t(`${q.name}_${v}`)}</option>
              ))}
            </Select>
          </Field>
        ))}

        <Field label={t("largeLoanBase")}>
          <TextInput name="largeLoanBase" inputMode="numeric" defaultValue="100000" />
        </Field>

        <Field label={t("advicePriority")}>
          <Select name="advicePriority" defaultValue="4">
            {[1, 2, 3, 4].map((v) => (
              <option key={v} value={v}>{t(`advicePriority_${v}`)}</option>
            ))}
          </Select>
        </Field>

        <p className="text-xs text-neutral-400">{t("applyNote")}</p>
        <SubmitButton label={t("apply")} />
      </form>
    </Card>
  );
}
