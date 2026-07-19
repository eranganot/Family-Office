import { formatDate, formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { PhaseGate } from "../phase-gate";
import { addValuationAction, closeItemAction, confirmGrowthShareAction, suggestGrowthSharesAction } from "../../../../lib/actions/mapping-actions";
import { Card, ErrorBanner, SubmitButton, TextInput, SuccessBanner } from "../../../../components/fields";
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
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { locale } = await params;
  const { error, ok } = await searchParams;
  const t = await getTranslations();
  const tok = await getTranslations("ok");
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
        <SuccessBanner message={ok === "itemSaved" ? tok(ok) : undefined} />
        {!hasMembers ? <p className="mb-3 text-sm text-amber-700">{t("mapping.needMembers")}</p> : null}
        <form action={suggestGrowthSharesAction} className="mb-3">
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700">
            {t("mapping.suggestGrowth")}
          </button>
          <span className="ms-2 text-xs text-neutral-400">{t("mapping.suggestGrowthHint")}</span>
        </form>
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
          <div className="flex flex-col items-start gap-3">
            <div>
              <p className="text-base font-semibold text-neutral-900">{t("mapping.emptyTitle")}</p>
              <p className="mt-1 text-sm text-neutral-600" dir="auto">{t("mapping.emptyHint")}</p>
            </div>
            <Link href="/mapping/new/ACCOUNT" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
              {t("mapping.emptyCta")}
            </Link>
          </div>
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
                      {item.accountDetail?.growthSharePct != null ? (
                        item.accountDetail.growthShareEstimated ? (
                          <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            {t("mapping.growthEstimate")}: {String(item.accountDetail.growthSharePct)}%
                            <form action={confirmGrowthShareAction} className="inline">
                              <input type="hidden" name="locale" value={locale} />
                              <input type="hidden" name="id" value={item.id} />
                              <button type="submit" className="font-medium underline">{t("mapping.confirmEstimate")}</button>
                            </form>
                          </span>
                        ) : (
                          <span className="ms-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                            {t("mapping.growthConfirmed")}: {String(item.accountDetail.growthSharePct)}%
                          </span>
                        )
                      ) : null}
                      <span className="ms-2 text-xs text-neutral-400">
                        {item.kind === "INSURANCE" && item.insuranceDetail
                          ? item.insuranceDetail.coverageAmount != null
                            ? `${t("mapping.coverage")}: ${formatMoney(item.insuranceDetail.coverageAmount.toString(), item.currency, locale as Locale)}`
                            : t("mapping.noCoverage")
                          : item.kind === "CASH_FLOW" && item.cashFlowDetail
                            ? `${t("mapping.flowAmount")}: ${formatMoney(item.cashFlowDetail.amount.toString(), item.currency, locale as Locale)}`
                            : item.latestValuation
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
      <PhaseGate locale={locale} />
    </div>
  );
}
