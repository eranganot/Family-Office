import { type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { ErrorBanner, Explainer } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { ActionCenterSection } from "./sections/action-center";
import { OpportunityCenterSection } from "./sections/opportunity-center";
import { OperationsNav } from "./sections/operations-nav";

/**
 * M42b — `/operations`, "Today". What needs the owner's attention.
 *
 * This file was ~1,550 lines and ten Cards. Everything with a different CADENCE now has
 * its own route: the monthly ritual at `/operations/month`, forward commitments at
 * `/operations/calendar`, and the whole classification layer — import, the transaction
 * list, the category tree, the suspense queue, manual entry — at `/transactions`.
 *
 * What remains is the two decision inboxes. Gate 4 turns even these into compact rows
 * with counts, so that Today answers one question and then gets out of the way; full
 * cards here are how a landing page starts re-accreting into the wall this rebuild
 * exists to undo.
 *
 * It also fetches TWO things. It used to fetch eleven on every load, including
 * `computePeriod` — the most expensive call in the module — for a month view most
 * visits never looked at.
 */

export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    n?: string;
    why?: string;
    mb?: string;
    oppsRun?: string;
    oppsUpdated?: string;
    oppsUnreviewed?: string;
    actionUpdated?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations("operations");
  const tf = await getTranslations("forms");
  const loc = locale as Locale;
  const trpc = await serverCaller();

  // M40a — reading NEVER generates: the list is whatever the last explicit run produced,
  // so a refresh cannot silently supersede the owner's inbox.
  const opps = await trpc.operations.opportunities.list().catch(() => null);
  // M40c — the Action Center: committed work from BOTH engines. Reading never mutates.
  const actions = await trpc.operations.actions.list().catch(() => null);
  const baseCurrency = "ILS";

  const errorMsg = sp.error
    ? sp.error === "toolarge"
      ? t("errorTooLarge", { mb: sp.mb ?? "?" })
      : sp.error === "allfailed"
        // Show the underlying reason: a bare "save failed" told the owner nothing and
        // cost a whole round-trip to diagnose a simple validation rejection.
        ? t("errorAllFailed", { n: sp.n ?? "?", why: sp.why ?? "UNKNOWN" })
        : tf("error")
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <OperationsNav locale={locale} active="" />

      <Explainer title={t("explainer.title")} paragraphs={[t("explainer.p1"), t("explainer.p2")]} />

      <ErrorBanner message={errorMsg} />

      {/*
        The Action Center sits ABOVE the Opportunity Center on purpose: work already
        committed to outranks new suggestions. An inbox that shows fresh proposals first
        quietly rewards deciding over doing.
      */}
      <div id="actions" />
      <ActionCenterSection
        actions={actions}
        locale={locale}
        loc={loc}
        savedMessage={sp.actionUpdated ? tf("saved") : undefined}
      />

      <div id="opportunities" />
      <OpportunityCenterSection
        opps={opps}
        locale={locale}
        loc={loc}
        baseCurrency={baseCurrency}
        ranMessage={sp.oppsRun ? t("oppsRun", { n: sp.oppsRun }) : undefined}
        savedMessage={sp.oppsUpdated ? tf("saved") : undefined}
        usesUnreviewedTax={Boolean(sp.oppsUnreviewed)}
      />
    </div>
  );
}
