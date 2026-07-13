import { formatDate, formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { addValuationAction, closeItemAction } from "../../../../lib/actions/mapping-actions";
import { Card, ErrorBanner, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { Link } from "../../../../i18n/navigation";

const NEW_KINDS = [
  "account",
  "real-estate",
  "mortgage",
  "cash-flow",
  "insurance",
  "loan",
  "other-asset",
  "other-liability",
] as const;

const KIND_LABEL: Record<(typeof NEW_KINDS)[number], string> = {
  account: "ACCOUNT",
  "real-estate": "REAL_ESTATE",
  mortgage: "MORTGAGE",
  "cash-flow": "CASH_FLOW",
  insurance: "INSURANCE",
  loan: "LOAN",
  "other-asset": "OTHER_ASSET",
  "other-liability": "OTHER_LIABILITY",
};

export default async function MappingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations();
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  const items = household ? await trpc.ledger.list() : [];
  const hasMembers = (household?.members.length ?? 0) > 0;

  const byKind = new Map<string, typeof items>();
  for (const item of items) {
    const list = byKind.get(item.kind) ?? [];
    list.push(item);
    byKind.set(item.kind, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("mapping.title")}>
        <ErrorBanner message={error ? `${t("forms.error")}: ${decodeURIComponent(error)}` : undefined} />
        {!hasMembers ? <p className="mb-3 text-sm text-amber-700">{t("mapping.needMembers")}</p> : null}
        <div className="flex flex-wrap gap-2">
          {NEW_KINDS.map((k) => (
            <Link
              key={k}
              href={`/mapping/new/${k}`}
              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              + {t(`kinds.${KIND_LABEL[k]}`)}
            </Link>
          ))}
        </div>
      </Card>

      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">{t("mapping.empty")}</p>
        </Card>
      ) : (
        [...byKind.entries()].map(([kind, kindItems]) => (
          <Card key={kind} title={t(`kinds.${kind}`)}>
            <ul className="flex flex-col gap-3">
              {kindItems.map((item) => (
                <li key={item.id} className="rounded-lg border border-neutral-100 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="ms-2 text-xs text-neutral-400">
                        {item.latestValuation
                          ? `${t("mapping.latestValue")}: ${formatMoney(item.latestValuation.value.toString(), item.latestValuation.currency, locale as Locale)} (${t("mapping.asOf")} ${formatDate(item.latestValuation.asOf, locale as Locale)})`
                          : t("mapping.noValuation")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link href={`/mapping/edit/${item.id}`} className="text-xs text-blue-600 underline">
                        {t("forms.edit")}
                      </Link>
                      <form action={closeItemAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="text-xs text-neutral-400 underline">
                          {t("mapping.close")}
                        </button>
                      </form>
                    </div>
                  </div>
                  {item.kind !== "CASH_FLOW" && item.kind !== "INSURANCE" ? (
                    <form action={addValuationAction} className="mt-2 flex items-end gap-2">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="ledgerItemId" value={item.id} />
                      <input type="hidden" name="currency" value={item.currency} />
                      <TextInput name="value" inputMode="decimal" placeholder={t("forms.value")} required />
                      <TextInput name="valueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                      <SubmitButton label={t("mapping.addValuation")} />
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
