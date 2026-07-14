import { getTranslations } from "next-intl/server";
import { logout } from "../../../lib/auth-actions";
import { serverCaller } from "../../../lib/trpc-server";
import { Link } from "../../../i18n/navigation";
import { NavLinks } from "../../../components/nav-links";

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
      <NavLinks
        items={[
          { href: "/", label: t("nav.dashboard") },
          { href: "/mapping", label: t("nav.mapping") },
          { href: "/documents", label: t("nav.documents") },
          { href: "/verification", label: t("nav.verification") },
          { href: "/goals", label: t("nav.goals") },
          { href: "/strategy", label: t("nav.strategy") },
          { href: "/scenarios", label: t("nav.scenarios") },
          { href: "/journal", label: t("nav.journal") },
          { href: "/monitoring", label: t("nav.monitoring") },
          { href: "/household", label: t("nav.household") },
          { href: "/fx", label: t("nav.fx") },
          { href: "/registry", label: t("nav.registry") },
        ]}
      />
      {household ? (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-xs">
          {(["MAPPING", "VERIFICATION", "STRATEGY", "MONITORING"] as const).map((phase, i) => {
            const current = household.workflowState === phase;
            const hrefs = { MAPPING: "/mapping", VERIFICATION: "/verification", STRATEGY: "/strategy", MONITORING: "/monitoring" } as const;
            return (
              <span key={phase} className="flex items-center gap-2">
                {i > 0 ? <span className="text-neutral-300">←</span> : null}
                <Link
                  href={hrefs[phase]}
                  className={
                    current
                      ? "rounded-full bg-blue-600 px-3 py-1 font-semibold text-white"
                      : "rounded-full bg-white px-3 py-1 text-neutral-500 ring-1 ring-neutral-200 hover:text-neutral-800"
                  }
                >
                  {i + 1}. {t(`phase.${phase}`)}
                </Link>
              </span>
            );
          })}
          <span className="ms-2 text-neutral-500">
            {t(`journey.${household.workflowState}`)}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
