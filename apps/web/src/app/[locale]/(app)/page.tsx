import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { serverCaller } from "../../../lib/trpc-server";
import { Card } from "../../../components/fields";
import { Link } from "../../../i18n/navigation";

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = await getTranslations();
  const trpc = await serverCaller();
  const household = await trpc.household.get();

  if (!household) {
    return (
      <Card>
        <p className="mb-4 text-sm text-neutral-600">{t("dashboard.noHousehold")}</p>
        <Link href="/household" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          {t("dashboard.setupCta")}
        </Link>
      </Card>
    );
  }

  const report = await trpc.networth.report();
  const base = report.baseCurrency;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-4">
        <Card title={t("dashboard.assets")}>
          <p className="text-2xl font-bold">{formatMoney(report.totalAssets, base, locale)}</p>
        </Card>
        <Card title={t("dashboard.liabilities")}>
          <p className="text-2xl font-bold">{formatMoney(report.totalLiabilities, base, locale)}</p>
        </Card>
        <Card title={t("dashboard.netWorth")}>
          <p className="text-2xl font-bold text-blue-700">{formatMoney(report.netWorth, base, locale)}</p>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card title={t("dashboard.byKind")}>
          <ul className="flex flex-col gap-2 text-sm">
            {Object.entries(report.byKind).map(([kind, value]) => (
              <li key={kind} className="flex justify-between">
                <span>{t(`kinds.${kind}`)}</span>
                <span className="font-medium">{formatMoney(value, base, locale)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("dashboard.byCurrency")}>
          <ul className="flex flex-col gap-2 text-sm">
            {Object.entries(report.byCurrency).map(([ccy, value]) => (
              <li key={ccy} className="flex justify-between">
                <span>{ccy}</span>
                <span className="font-medium">{formatMoney(value, ccy, locale)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {report.excluded.length > 0 ? (
        <Card title={t("dashboard.excluded")}>
          <ul className="flex flex-col gap-1 text-sm text-amber-700">
            {report.excluded.map((e) => (
              <li key={e.id}>
                {e.name} — {t(`dashboard.excludedReason.${e.reason}`)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
