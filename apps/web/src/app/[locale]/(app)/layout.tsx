import { getTranslations } from "next-intl/server";
import { logout } from "../../../lib/auth-actions";
import { serverCaller } from "../../../lib/trpc-server";
import { Link } from "../../../i18n/navigation";
import { LocaleSwitch } from "../../../components/locale-switch";
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
          <LocaleSwitch currentLocale={locale} label={t("nav.switchLocale")} />
          <form action={logout}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="text-sm text-neutral-500 underline">
              {t("nav.logout")}
            </button>
          </form>
        </div>
      </header>
      {/*
        M42 — fourteen flat links grouped into four, by what the owner is DOING. The
        order follows the phase model the app already teaches (map → verify → decide →
        run), so the nav reinforces the workflow rather than offering fourteen
        equal-weight destinations.

        Transactions is deliberately absent: it lives in the Operations sub-nav beside
        Today / Month / Calendar (owner decision), and adding it here would have made
        fifteen.
      */}
      <NavLinks
        groups={[
          { label: t("nav.dashboard"), items: [{ href: "/", label: t("nav.dashboard") }] },
          {
            // Build the picture: what the household HAS, and whether it is trustworthy.
            label: t("navGroup.picture"),
            items: [
              { href: "/mapping", label: t("nav.mapping") },
              { href: "/documents", label: t("nav.documents") },
              { href: "/verification", label: t("nav.verification") },
              { href: "/household", label: t("nav.household") },
            ],
          },
          {
            // Decide: where money should go, and what it is for.
            label: t("navGroup.decide"),
            items: [
              { href: "/strategy", label: t("nav.strategy") },
              { href: "/goals", label: t("nav.goals") },
              { href: "/allocation", label: t("nav.allocation") },
              { href: "/scenarios", label: t("nav.scenarios") },
            ],
          },
          {
            // Run: the month-to-month loop and its record.
            label: t("navGroup.run"),
            items: [
              { href: "/operations", label: t("nav.operations") },
              { href: "/journal", label: t("nav.journal") },
              { href: "/monitoring", label: t("nav.monitoring") },
            ],
          },
          {
            // Reference data the engines read but the owner rarely edits.
            label: t("navGroup.reference"),
            items: [
              { href: "/registry", label: t("nav.registry") },
              { href: "/fx", label: t("nav.fx") },
            ],
          },
        ]}
      />
      {household ? (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-xs">
          {(["MAPPING", "VERIFICATION", "ALLOCATION", "STRATEGY", "MONITORING"] as const).map((phase, i) => {
            const current = household.workflowState === phase;
            const hrefs = { MAPPING: "/mapping", VERIFICATION: "/verification", ALLOCATION: "/allocation", STRATEGY: "/strategy", MONITORING: "/monitoring" } as const;
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
      {/*
        M43 — Operations as an ALWAYS-ON LOOP, deliberately OUTSIDE the numbered strip.

        Owner, 2026-08-02: mapping / verification / allocation are one-time, strategy is
        quarterly, operations is daily-to-monthly — "so I would expect to see operations
        after the strategy phase". The observation is right; the placement is not, and
        the difference matters.

        Phases are GATED — that is their whole purpose (`workflowGuard`, `evaluateTransition`).
        Operations is deliberately CROSS-PHASE (owner decision D2): you close months and
        clear suspense no matter which phase the household is in. Making it phase six
        would gate the daily work behind a state machine, and would let a MAPPING-phase
        household reach allocation through the back door - precisely what the guard
        exists to prevent.

        So it is rendered as a separate, permanently available band: a loop that runs
        alongside the sequence rather than a step inside it. The numbered strip answers
        "how far through setup am I"; this answers "what does this household need from me
        this week", which is the question that never stops being asked.
      */}
      {household ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3 text-xs">
          <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-blue-700 ring-1 ring-blue-200">
            {t("journeyLoop.badge")}
          </span>
          <span className="text-neutral-600">{t("journeyLoop.intro")}</span>
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/operations" className="rounded-full bg-white px-3 py-1 text-neutral-600 ring-1 ring-neutral-200 hover:text-neutral-900">
              {t("journeyLoop.today")}
            </Link>
            <Link href="/operations/month" className="rounded-full bg-white px-3 py-1 text-neutral-600 ring-1 ring-neutral-200 hover:text-neutral-900">
              {t("journeyLoop.month")}
            </Link>
            <Link href="/transactions" className="rounded-full bg-white px-3 py-1 text-neutral-600 ring-1 ring-neutral-200 hover:text-neutral-900">
              {t("journeyLoop.transactions")}
            </Link>
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
