import { getTranslations } from "next-intl/server";
import { logout } from "../../lib/auth-actions";
import { serverCaller } from "../../lib/trpc-server";
import { Link } from "../../i18n/navigation";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();
  const trpc = await serverCaller();
  const me = await trpc.health.whoami();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
          <p className="text-sm text-neutral-500">{t("app.tagline")}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" locale={locale === "he" ? "en" : "he"} className="text-sm underline">
            {t("nav.switchLocale")}
          </Link>
          <form action={logout}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="text-sm text-neutral-500 underline">
              {t("nav.logout")}
            </button>
          </form>
        </div>
      </header>
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          {t("phase.label")}
        </div>
        <div className="inline-block rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          {t("phase.MAPPING")}
        </div>
        <p className="mt-4 text-sm text-neutral-600">{t("home.emptyState")}</p>
        <p className="mt-2 text-xs text-neutral-400">
          {t("home.welcome")}: {me.email}
        </p>
      </section>
    </main>
  );
}
