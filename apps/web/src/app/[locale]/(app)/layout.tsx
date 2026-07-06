import { getTranslations } from "next-intl/server";
import { logout } from "../../../lib/auth-actions";
import { serverCaller } from "../../../lib/trpc-server";
import { Link } from "../../../i18n/navigation";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const trpc = await serverCaller();
  const household = await trpc.household.get();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
          <p className="text-xs text-neutral-500">{t("app.tagline")}</p>
        </div>
        <div className="flex items-center gap-3">
          {household ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {t("phase.label")}: {t(`phase.${household.workflowState}`)}
            </span>
          ) : null}
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
      <nav className="mb-6 flex gap-4 border-b border-neutral-200 pb-3 text-sm">
        <Link href="/" className="font-medium hover:underline">{t("nav.dashboard")}</Link>
        <Link href="/mapping" className="font-medium hover:underline">{t("nav.mapping")}</Link>
        <Link href="/documents" className="font-medium hover:underline">{t("nav.documents")}</Link>
        <Link href="/verification" className="font-medium hover:underline">{t("nav.verification")}</Link>
        <Link href="/goals" className="font-medium hover:underline">{t("nav.goals")}</Link>
        <Link href="/strategy" className="font-medium hover:underline">{t("nav.strategy")}</Link>
        <Link href="/scenarios" className="font-medium hover:underline">{t("nav.scenarios")}</Link>
        <Link href="/journal" className="font-medium hover:underline">{t("nav.journal")}</Link>
        <Link href="/monitoring" className="font-medium hover:underline">{t("nav.monitoring")}</Link>
        <Link href="/household" className="font-medium hover:underline">{t("nav.household")}</Link>
        <Link href="/fx" className="font-medium hover:underline">{t("nav.fx")}</Link>
        <Link href="/registry" className="font-medium hover:underline">{t("nav.registry")}</Link>
      </nav>
      {children}
    </div>
  );
}
