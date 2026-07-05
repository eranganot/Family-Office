import { formatDate, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { setFxRateAction } from "../../../../lib/actions/household-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

export default async function FxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("fx");
  const tf = await getTranslations("forms");
  const trpc = await serverCaller();
  const rates = await trpc.networth.fxRates();
  const currencies = ["USD", "EUR", "ILS"] as const;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        <ErrorBanner message={error ? tf("error") : undefined} />
        <form action={setFxRateAction} className="grid max-w-3xl grid-cols-4 items-end gap-4">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("from")}>
            <Select name="from" defaultValue="USD">
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t("to")}>
            <Select name="to" defaultValue="ILS">
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t("rate")}>
            <TextInput name="rate" inputMode="decimal" required placeholder="3.6000" />
          </Field>
          <Field label={t("asOf")}>
            <TextInput name="asOf" type="date" defaultValue={today} />
          </Field>
          <div className="col-span-4">
            <SubmitButton label={t("set")} />
          </div>
        </form>
      </Card>
      <Card>
        {rates.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-neutral-400">
                <th className="pb-2 text-start">{t("from")}</th>
                <th className="pb-2 text-start">{t("to")}</th>
                <th className="pb-2 text-start">{t("rate")}</th>
                <th className="pb-2 text-start">{t("asOf")}</th>
                <th className="pb-2 text-start">{t("source")}</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="py-2">{r.from}</td>
                  <td className="py-2">{r.to}</td>
                  <td className="py-2 font-medium">{r.rate.toString()}</td>
                  <td className="py-2">{formatDate(r.asOf, locale as Locale)}</td>
                  <td className="py-2 text-neutral-400">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
