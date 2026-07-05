import { useTranslations } from "next-intl";
import { Link } from "../../i18n/navigation";

export default function Home() {
  const t = useTranslations();
  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
          <p className="text-sm text-neutral-500">{t("app.tagline")}</p>
        </div>
        <LocaleSwitcher />
      </header>
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          {t("phase.label")}
        </div>
        <div className="inline-block rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          {t("phase.MAPPING")}
        </div>
        <p className="mt-4 text-sm text-neutral-600">{t("home.emptyState")}</p>
      </section>
    </main>
  );
}

function LocaleSwitcher() {
  const t = useTranslations();
  return (
    <Link href="/" locale={t("nav.switchLocale") === "English" ? "en" : "he"} className="text-sm underline">
      {t("nav.switchLocale")}
    </Link>
  );
}
