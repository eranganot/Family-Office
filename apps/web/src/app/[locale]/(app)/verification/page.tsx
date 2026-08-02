import { formatDate, formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { PhaseGate } from "../phase-gate";
import { addValuationAction } from "../../../../lib/actions/mapping-actions";
import { rejectItemAction, verifyItemAction } from "../../../../lib/actions/verification-actions";
import { Card, SubmitButton, TextInput, Explainer } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

export default async function VerificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("verification");
  const tk = await getTranslations("kinds");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;

  const { assessment, missingDocs } = await trpc.verification.assessment();
  const items = await trpc.ledger.list();
  const itemById = new Map(items.map((i) => [i.id, i]));
  const needsReview = assessment.items.filter((a) => !a.verified);

  return (
    <div className="flex flex-col gap-6">
      <Explainer title={t("explainerTitle")} paragraphs={[t("explainer1"), t("explainer2"), t("explainer3")]} />
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("transitionError")}: {decodeURIComponent(error)}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-4">
        <Card title={t("completeness")}>
          <p className="text-2xl font-bold">{assessment.completenessScore}%</p>
          <p className="text-xs text-neutral-400">
            {assessment.verifiedCount}/{assessment.totalCount} {t("verifiedOf")}
          </p>
        </Card>
        <Card title={t("confidence")}>
          <p className="text-2xl font-bold">{assessment.confidenceScore}</p>
        </Card>
      </div>

      {missingDocs.expectations.length > 0 ? (
        <Card title={t("missingDocs")}>
          <ul className="flex flex-col gap-1 text-sm">
            {missingDocs.expectations.map((e, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {e.expectedDocType} <span className="text-neutral-400">{t("forItem")} {e.itemName}</span>
                  {/* A Mislaka answering a PENSION_REPORT row looks like a mistake unless
                      the row says which document satisfied it. */}
                  {e.satisfiedByDocType && e.satisfiedByDocType !== e.expectedDocType ? (
                    <span className="text-neutral-400"> · {t("satisfiedBy", { docType: e.satisfiedByDocType })}</span>
                  ) : null}
                </span>
                <span
                  className={
                    e.status === "PRESENT"
                      ? "text-green-600"
                      : e.status === "STALE" || e.status === "UNATTRIBUTED"
                        ? "text-amber-600"
                        : "text-red-600"
                  }
                >
                  {t(`docStatus.${e.status}`)}
                </span>
              </li>
            ))}
          </ul>
          {/* "Not linked" is a new and genuinely confusing state on first sight — it has
              to explain itself and say what to do, or it just reads as a broken green. */}
          {missingDocs.unattributedCount > 0 ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("unattributedHint", { count: missingDocs.unattributedCount })}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card title={`${t("queue")} (${needsReview.length})`}>
        {needsReview.length === 0 ? (
          /*
            "All items verified. Nothing to check." was an unqualified clean bill of
            health rendered directly BELOW a list of missing documents — two cards on one
            page contradicting each other, and the owner reasonably read the red list as
            the broken one.

            Neither is broken; they measure different things. This queue asks whether the
            OWNER has attested to each item (verification === VERIFIED, no staleness or
            confidence issues), which manual confirmation alone satisfies. The card above
            asks whether a PRIMARY SOURCE backs it. An item can be attested with no
            document behind it, and that is exactly this household's position.

            So the queue no longer claims completeness it cannot see. It states what it
            actually checked, and names what it did not.
          */
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-500">{t("queueEmptyAttested")}</p>
            {missingDocs.missingCount > 0 ? (
              <p className="text-sm text-amber-700">{t("queueEmptyButDocsMissing", { count: missingDocs.missingCount })}</p>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {needsReview.map((a) => {
              const item = itemById.get(a.id);
              return (
                <li key={a.id} className="rounded-lg border border-neutral-100 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{a.name}</span>
                      <span className="ms-2 text-xs text-neutral-400">{tk(a.kind)}</span>
                      {item?.latestValuation ? (
                        <span className="ms-2 text-xs text-neutral-400">
                          {formatMoney(item.latestValuation.value.toString(), item.latestValuation.currency, locale as Locale)}{" "}
                          ({formatDate(item.latestValuation.asOf, locale as Locale)})
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {a.issues.map((issue, i) => (
                      <span key={i} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                        {t(`issues.${issue.type}`, issue as never)}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <form action={verifyItemAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="itemId" value={a.id} />
                      <button type="submit" className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white">
                        {t("verify")}
                      </button>
                    </form>
                    <form action={rejectItemAction} className="flex items-end gap-2">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="itemId" value={a.id} />
                      <TextInput name="note" placeholder={t("rejectNote")} />
                      <button type="submit" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700">
                        {t("reject")}
                      </button>
                    </form>
                    {item && item.kind !== "CASH_FLOW" && item.kind !== "INSURANCE" ? (
                      <form action={addValuationAction} className="flex items-end gap-2">
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="ledgerItemId" value={a.id} />
                        <input type="hidden" name="currency" value={item.currency} />
                        <TextInput name="value" inputMode="decimal" placeholder={t("correct")} />
                        <TextInput name="valueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                        <SubmitButton label={t("correct")} />
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <PhaseGate locale={locale} />
    </div>
  );
}
