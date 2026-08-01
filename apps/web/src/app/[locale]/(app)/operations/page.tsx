import { type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { Card, ErrorBanner, Explainer, Field, Select, SubmitButton, SuccessBanner, TextInput } from "../../../../components/fields";
import {
  commitAllPendingAction,
  commitStatementAction,
  resetAllImportsAction,
  undoImportAction,
  uploadStatementAction,
} from "../../../../lib/actions/operations-actions";
import { serverCaller } from "../../../../lib/trpc-server";
import { ActionCenterSection } from "./sections/action-center";
import { OpportunityCenterSection } from "./sections/opportunity-center";
import { OperationsNav } from "./sections/operations-nav";


export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    /*
     * M42b — what Today still reads: import outcomes, and the two inbox sections.
     * Moved out with their sections: y / m / recomputed / closed / reopened (month),
     * cw / calendarBuilt / recurringSaved / suggestApplied (calendar), and
     * cat / beh / edit / created / classified / categorySaved / updated / removed /
     * restored / dupesRemoved (transactions).
     */
    error?: string;
    preview?: string; imported?: string; dupes?: string; uploaded?: string; failed?: string;
    mb?: string; skipped?: string; undone?: string; reset?: string; docs?: string; n?: string; why?: string; reused?: string;
    oppsRun?: string; oppsUpdated?: string; oppsUnreviewed?: string;
    actionUpdated?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations("operations");
  const tf = await getTranslations("forms");
  const trpc = await serverCaller();

  // M42b: the category tree seed moved to /transactions with the sections that use it.
  const meta = await trpc.operations.meta();
  // Preview is a mutation (it does real parsing work) but persists nothing.
  // NEVER swallow this: a silent catch here renders an empty card and looks like the
  // feature simply does not exist. Surface the reason instead.
  let preview: Awaited<ReturnType<typeof trpc.operations.import.preview>> | null = null;
  let previewError: string | null = null;
  if (sp.preview) {
    try {
      preview = await trpc.operations.import.preview({ documentId: sp.preview });
    } catch (e) {
      previewError = e instanceof Error ? e.message : "PREVIEW_FAILED";
    }
  }
  const pending = await trpc.operations.import.pending().catch(() => []);
  const batches = await trpc.operations.import.batches().catch(() => []);
  /*
   * M42b — what this page NO LONGER fetches, and why that is the point of the split:
   *
   *   period.current + diagnostics.month  -> /operations/month  (computePeriod is the
   *                                          most expensive call in this module)
   *   period.months                       -> /operations/month
   *   projection.eoy + review.driftAlerts -> /operations/month
   *   calendar.upcoming + recurring.list  -> /operations/calendar
   *
   * Six round-trips that ran on EVERY load of this page now run only when the owner is
   * actually looking at the thing they feed.
   */
  // M40a — the Opportunity Center. Reading NEVER generates: the list is whatever the
  // last explicit run produced, so a refresh cannot silently supersede the inbox.
  const opps = await trpc.operations.opportunities.list().catch(() => null);
  // M40c — the Action Center: committed work from BOTH engines. Reading never mutates.
  const actions = await trpc.operations.actions.list().catch(() => null);
  const baseCurrency = "ILS";

  const loc = locale as Locale;

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

      {/* ---------------------------------------------------------- M38b --- */}
      <div id="import" />
      <Card title={t("importTitle")}>
        <p className="mb-4 text-xs text-neutral-500">{t("importHint")}</p>
        <form action={uploadStatementAction} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("importFile")}>
            <input
              type="file"
              name="file"
              multiple
              required
              accept=".csv,.txt,.tsv,.html,.htm,.pdf,text/csv,text/html,application/pdf"
              className="text-sm"
            />
          </Field>
          <Field label={t("statementType")}>
            <Select name="statementType" defaultValue="BANK_STATEMENT">
              <option value="BANK_STATEMENT">{t("typeBank")}</option>
              <option value="CARD_STATEMENT">{t("typeCard")}</option>
            </Select>
          </Field>
          <Field label={t("importInstitution")}>
            <TextInput name="institutionName" placeholder={t("importInstitutionPlaceholder")} />
          </Field>
          <SubmitButton label={t("importUpload")} />
        </form>

        {sp.uploaded ? (
          <p className="mt-3 text-xs text-neutral-600">
            {t("uploadedCount", { n: sp.uploaded, failed: sp.failed ?? "0" })}
            {sp.reused && sp.reused !== "0" ? ` ${t("alreadyUploaded", { n: sp.reused })}` : ""}
          </p>
        ) : null}

        {pending.length > 0 ? (
          <div className="mt-4 rounded-lg bg-neutral-50 px-3 py-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-neutral-600">{t("pendingStatements")}</p>
              <form action={commitAllPendingAction}>
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
                  {t("importAllPending", { n: pending.length })}
                </button>
              </form>
            </div>
            <p className="mb-2 text-xs text-neutral-500">{t("importAllHint")}</p>
            <ul className="flex flex-col gap-1 text-xs">
              {pending.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{d.filename}</span>
                  <a
                    href={`/${locale}/operations?preview=${d.id}`}
                    className={`shrink-0 underline ${sp.preview === d.id ? "text-neutral-400" : "text-blue-600"}`}
                  >
                    {sp.preview === d.id ? t("previewing") : t("previewThis")}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-red-600">{t("dangerZone")}</summary>
          <p className="mt-2 text-neutral-600">{t("resetHint")}</p>
          <form action={resetAllImportsAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="locale" value={locale} />
            <TextInput name="confirm" placeholder="DELETE ALL" />
            <button type="submit" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white">
              {t("resetAll")}
            </button>
          </form>
        </details>

        {batches.length > 0 ? (
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-neutral-600">{t("importHistory")}</summary>
            <p className="mt-2 text-neutral-500">{t("undoHint")}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 py-1">
                  <span className="truncate">
                    {b.document?.filename ?? b.adapterId}
                    {" · "}
                    {new Date(b.startedAt).toISOString().slice(0, 10)}
                    {" · "}
                    {t("batchRows", { n: b._count.transactions })}
                  </span>
                  <form action={undoImportAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="batchId" value={b.id} />
                    <button type="submit" className="text-red-600 underline">{t("undoImport")}</button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {previewError ? (
          <div className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">{t("previewFailed")}</p>
            <p className="mt-1 font-mono text-xs break-all">{previewError}</p>
          </div>
        ) : null}

        {preview ? (
          preview.unsupportedReason ? (
            <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">{t(`importUnsupported.${preview.unsupportedReason}`)}</p>
            </div>
          ) : (
            <div className="mt-6 border-t border-neutral-100 pt-6">
              <h3 className="mb-1 text-sm font-semibold">{t("previewTitle")}</h3>
              <p className="mb-4 text-xs text-neutral-500">
                {t("previewSummary", {
                  rows: preview.totalRows,
                  usable: preview.drafts.length,
                  dupes: preview.duplicates,
                  skipped: preview.issues.length,
                })}
                {preview.detectedRange
                  ? ` · ${t("previewRange", {
                      start: preview.detectedRange.start,
                      end: preview.detectedRange.end,
                      days: preview.detectedRange.days,
                    })}`
                  : ""}
                {` · ${t("previewEncoding", { encoding: preview.encoding, format: preview.format })}`}
              </p>
              {preview.statementTotal !== undefined ? (
                <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${preview.reconciles ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {preview.reconciles
                    ? t("reconcilesOk", { total: preview.statementTotal.toFixed(2) })
                    : t("reconcilesFail", {
                        statement: preview.statementTotal.toFixed(2),
                        parsed: Math.abs(preview.parsedTotal ?? 0).toFixed(2),
                      })}
                </p>
              ) : null}

              <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${preview.inflowCount > 0 && preview.outflowCount === 0 ? "bg-amber-50 text-amber-800" : "bg-neutral-50 text-neutral-700"}`}>
                {t("previewDirection", {
                  out: preview.outflowCount,
                  outTotal: Math.abs(preview.outflowTotal).toFixed(2),
                  in: preview.inflowCount,
                  inTotal: preview.inflowTotal.toFixed(2),
                })}
                {preview.inflowCount > 0 && preview.outflowCount === 0 ? ` ${t("previewAllIncomeWarning")}` : ""}
              </p>

              <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                {t("previewRedaction", { n: preview.redactedFields, version: preview.redactionVersion })}
              </p>

              {preview.issues.some((i) => i.raw === "BANK_COLUMNS_NOT_DETECTED") ? (
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t("bankColumnsFailed")}
                </p>
              ) : null}

              {preview.drafts.length > 0 ? (
                <table className="mb-6 w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-500">
                      <th className="py-1 text-start">{t("date")}</th>
                      <th className="py-1 text-start">{t("description")}</th>
                      <th className="py-1 text-start">{t("amount")}</th>
                      <th className="py-1 text-start">{t("currency")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.drafts.slice(0, 8).map((d, i) => (
                      <tr key={`${d.externalRef ?? i}`} className="border-b border-neutral-100">
                        <td className="py-1 whitespace-nowrap">{d.bookedAt}</td>
                        <td className="py-1">
                          {d.descriptionRedacted}
                          {d.status === "PENDING" ? (
                            <span className="ms-2 rounded bg-neutral-100 px-1 text-neutral-600">{t("pendingBadge")}</span>
                          ) : null}
                          {d.instalmentTotal ? (
                            <span className="ms-2 rounded bg-amber-50 px-1 text-amber-700">
                              {d.instalmentNumber}/{d.instalmentTotal}
                            </span>
                          ) : null}
                        </td>
                        <td className={`py-1 tabular-nums ${Number(d.amount) < 0 ? "" : "text-green-700"}`}>{d.amount}</td>
                        <td className="py-1">{d.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mb-4 text-sm text-amber-700">{t("previewNoRows")}</p>
              )}

              {preview.format === "PDF" ? (
                <form action={commitStatementAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="documentId" value={sp.preview ?? ""} />
                  <input type="hidden" name="amountMode" value="SIGNED" />
                  <input type="hidden" name="col_date" value="-" />
                  <input type="hidden" name="col_description" value="-" />
                  <p className="w-full text-xs text-neutral-500">
                    {t("pdfNoMapping")}
                    {preview.guessedMapping["issuer"]
                      ? ` · ${t("pdfIssuer", { issuer: String(preview.guessedMapping["issuer"]) })}`
                      : ""}
                  </p>
                  <SubmitButton label={t("importCommit")} />
                </form>
              ) : (
              <form action={commitStatementAction} className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="documentId" value={sp.preview ?? ""} />
                <Field label={t("mapAmountMode")}>
                  <Select name="amountMode" defaultValue={String(preview.guessedMapping["amountMode"] ?? "SIGNED")}>
                    <option value="SIGNED">{t("modeSigned")}</option>
                    <option value="DEBIT_CREDIT">{t("modeDebitCredit")}</option>
                  </Select>
                </Field>
                {([
                  ["col_date", "date", true],
                  ["col_description", "description", true],
                  ["col_amount", "amount", false],
                  ["col_debit", "debit", false],
                  ["col_credit", "credit", false],
                  ["col_currency", "currency", false],
                  ["col_reference", "reference", false],
                ] as const).map(([field, key, required]) => (
                  <Field key={field} label={t(`mapCol.${key}`)}>
                    <Select
                      name={field}
                      defaultValue={String(preview.guessedMapping[key] ?? "")}
                      required={required}
                    >
                      <option value="">{t("mapNone")}</option>
                      {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </Select>
                  </Field>
                ))}
                <Field label={t("mapPendingMarker")}>
                  <TextInput name="col_pendingMarker" placeholder="בתהליך קליטה" />
                </Field>
                <Field label={t("mapCurrencyDefault")}>
                  <Select name="defaultCurrency" defaultValue="ILS">
                    {["ILS", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="allOutflow" />
                  <span className="text-neutral-600">{t("allOutflow")}</span>
                </label>
                <Field label={t("saveProfileAs")}>
                  <TextInput name="saveProfileAs" placeholder={t("saveProfilePlaceholder")} />
                </Field>
                <SubmitButton label={t("importCommit")} />
              </form>
              )}

              {preview.issues.length > 0 ? (
                <details className="mt-4 text-xs text-neutral-500">
                  <summary className="cursor-pointer">{t("previewIssues", { n: preview.issues.length })}</summary>
                  <ul className="mt-2">
                    {preview.issues.slice(0, 10).map((iss, i) => (
                      <li key={i}>{t(`issue.${iss.reason}`)} — {iss.raw.slice(0, 60)}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )
        ) : null}
      </Card>
      <SuccessBanner
        message={
          /*
           * M42b — only IMPORT outcomes remain here. created / classified /
           * categorySaved / updated / removed / restored / dupesRemoved moved to
           * /transactions, and recomputed / closed / reopened to /operations/month,
           * each with the forms that produce them.
           */
          sp.undone ? t("undoneOk", { n: sp.undone })
          : sp.reset ? t("resetOk", { n: sp.reset, docs: sp.docs ?? "0" })
          : sp.imported
            ? sp.skipped && sp.skipped !== "0"
              ? t("importedSome", { n: sp.imported, dupes: sp.dupes ?? "0", skipped: sp.skipped })
              : t("importedOk", { n: sp.imported, dupes: sp.dupes ?? "0" })
          : undefined
        }
      />

      {/* ---------------------------------------------------------- M37 --- */}
      {/*
        M42b — the month overview and the monthly review MOVED to /operations/month.
        They belong together: closing a month is what produces the review, and reading
        the review is how you judge whether the close was sound. On this page they were
        ~250 lines apart.
      */}

      {/* ---------------------------------------------------------- M40c --- */}
      {/*
        The Action Center sits ABOVE the Opportunity Center on purpose: work already
        committed to outranks new suggestions. An inbox that shows fresh proposals
        first quietly rewards deciding over doing.
      */}
      <div id="actions" />
      {/*
        M42b — first section extracted to `sections/action-center.tsx`. Behaviour is
        unchanged; only the location moved. Data is still fetched by this page and
        passed down — narrowing each route to fetch only what it renders belongs to the
        routing step, not to the extraction step.
      */}
      <ActionCenterSection
        actions={actions}
        locale={locale}
        loc={loc}
        savedMessage={sp.actionUpdated ? tf("saved") : undefined}
      />

      {/* ---------------------------------------------------------- M39 --- */}
      <div id="opportunities" />
      {/* M42b — extracted to `sections/opportunity-center.tsx`. */}
      <OpportunityCenterSection
        opps={opps}
        locale={locale}
        loc={loc}
        baseCurrency={baseCurrency}
        ranMessage={sp.oppsRun ? t("oppsRun", { n: sp.oppsRun }) : undefined}
        savedMessage={sp.oppsUpdated ? tf("saved") : undefined}
        usesUnreviewedTax={Boolean(sp.oppsUnreviewed)}
      />


      {/*
        M42b — the suspense queue moved to /transactions, next to the list it is about
        and the tree it assigns from. Its COUNT belongs on Today (gate 4), because every
        closed month is provisional until this queue is cleared — but the queue itself is
        classification work, not day-to-day work.
      */}

      <p className="text-xs text-neutral-400">{t("engineVersion", { version: meta.engineVersion })}</p>
    </div>
  );
}
