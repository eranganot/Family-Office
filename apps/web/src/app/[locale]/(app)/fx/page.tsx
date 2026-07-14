import { formatDate, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { refreshBoiRateAction, refreshFxAction, setFxRateAction } from "../../../../lib/actions/household-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

export default async function FxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; refreshed?: string; boiRefreshed?: string }>;
}) {
  const { locale } = await params;
  const { error, refreshed, boiRefreshed } = await searchParams;
  const t = await getTranslations("fx");
  const tf = await getTranslations("forms");
  const trpc = await serverCaller();
  const rates = await trpc.networth.fxRates();
  const boi = await trpc.networth.boiRate();
  const currencies = ["USD", "EUR", "ILS"] as const;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        <ErrorBanner message={error ? tf("error") : undefined} />
        {refreshed ? <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("refreshedBanner")}</p> : null}
        {boiRefreshed ? <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("boiRateRefreshed")}</p> : null}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
          <span>{t("boiRateCurrent")}: <span className="font-medium">{boi ? `${boi.value}% (${boi.asOf})` : t("boiRateNone")}</span></span>
          <form action={refreshBoiRateAction}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="text-xs text-blue-600 underline">{t("boiRateRefresh")}</button>
          </form>
        </div>
        <form action={refreshFxAction} className="mb-4">
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
            {t("refreshFromBoi")}
          </button>
        </form>
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
