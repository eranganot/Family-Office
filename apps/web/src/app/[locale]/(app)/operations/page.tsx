import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { Card, ErrorBanner, Explainer, Field, Select, SubmitButton, SuccessBanner, TextInput } from "../../../../components/fields";
import {
  bulkClassifyMerchantAction,
  closePeriodAction,
  createManualTransactionAction,
  recomputePeriodAction,
  reopenPeriodAction,
  commitAllPendingAction,
  commitStatementAction,
  setTransactionStatusAction,
  updateTransactionAction,
  resetAllImportsAction,
  undoImportAction,
  uploadStatementAction,
  upsertCategoryAction,
} from "../../../../lib/actions/operations-actions";
import { BehavioralBars, CategoryTable, SurplusWaterfall } from "../../../../components/operations/dual-axis";
import { CategoryPicker, type PickerCategory } from "../../../../components/operations/category-picker";
import { serverCaller } from "../../../../lib/trpc-server";

const BEHAVIORAL = ["FIXED_CONTRACTUAL", "VARIABLE_DISCRETIONARY", "FINANCIAL_DRAG", "SAVINGS_FLOW", "TRANSFER"] as const;

interface FlatCategory {
  id: string;
  key: string;
  nameEn: string;
  nameHe: string;
  axis: "INCOME" | "EXPENSE";
  parentId: string | null;
  defaultBehavioralClass: string;
}

export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string; created?: string; classified?: string; categorySaved?: string;
    recomputed?: string; closed?: string; reopened?: string; tab?: string;
    updated?: string; removed?: string; restored?: string; edit?: string;
    preview?: string; imported?: string; dupes?: string; uploaded?: string; failed?: string;
    mb?: string; skipped?: string; undone?: string; reset?: string; docs?: string; n?: string; why?: string; reused?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations("operations");
  const tf = await getTranslations("forms");
  const trpc = await serverCaller();

  // Seeds the default tree on first read — idempotent.
  const cats = await trpc.operations.categories.tree();
  const meta = await trpc.operations.meta();
  const { rows: txns } = await trpc.operations.transactions.list({ limit: 50 });
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
  const period = await trpc.operations.period.current();
  const suspense = await trpc.operations.suspense.queue({ limit: 25 });
  const { year, month, row: periodRow, computed } = period;
  const diag = await trpc.operations.diagnostics.month({ year, month }).catch(() => null);
  const flow = computed.flow;
  const surplus = computed.surplus;
  const sts = computed.safeToSpend;
  const baseCurrency = "ILS";

  const flat = cats.flat as unknown as FlatCategory[];
  const byId = new Map(flat.map((c) => [c.id, c]));
  const pickerCats = flat as unknown as PickerCategory[];
  const today = new Date().toISOString().slice(0, 10);
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
          sp.created ? t("created")
          : sp.classified ? t("classified")
          : sp.categorySaved ? t("categorySaved")
          : sp.recomputed ? t("recomputed")
          : sp.closed ? t("closedOk")
          : sp.reopened ? t("reopenedOk")
          : sp.updated ? t("updatedOk")
          : sp.removed ? t("removedOk")
          : sp.restored ? t("restoredOk")
          : sp.undone ? t("undoneOk", { n: sp.undone })
          : sp.reset ? t("resetOk", { n: sp.reset, docs: sp.docs ?? "0" })
          : sp.imported
            ? sp.skipped && sp.skipped !== "0"
              ? t("importedSome", { n: sp.imported, dupes: sp.dupes ?? "0", skipped: sp.skipped })
              : t("importedOk", { n: sp.imported, dupes: sp.dupes ?? "0" })
          : undefined
        }
      />

      {/* ---------------------------------------------------------- M37 --- */}
      <div id="month" />
      <Card title={t("monthTitle", { month: String(month).padStart(2, "0"), year })}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <form action={recomputePeriodAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
              {t("recompute")}
            </button>
          </form>
          {periodRow?.status === "CLOSED" ? (
            <form action={reopenPeriodAction} className="flex items-center gap-2">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium">{t("periodClosed")}</span>
              <button type="submit" className="text-xs text-blue-600 underline">{t("reopen")}</button>
            </form>
          ) : (
            <form action={closePeriodAction} className="flex items-center gap-2">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <TextInput name="reviewNote" placeholder={t("reviewNotePlaceholder")} maxLength={2000} />
              <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">{t("closeMonth")}</button>
            </form>
          )}
        </div>

        {!flow.ok ? (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">{t("cannotCompute")}</p>
            <p className="mt-1">{t(`refusal.${flow.reason}`)}</p>
          </div>
        ) : (
          <>
            {flow.unverifiedCount > 0 ? (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t("provisionalBanner", {
                  count: flow.unverifiedCount,
                  amount: formatMoney(flow.unverifiedAmountBase, baseCurrency, loc),
                })}
              </p>
            ) : null}
            {flow.coverage !== "COMPLETE" ? (
              <p className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
                {t(`coverage.${flow.coverage}`)}
              </p>
            ) : null}

            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold">{t("surplusTitle")}</h3>
                <SurplusWaterfall
                  locale={loc}
                  currency={baseCurrency}
                  steps={[
                    { key: "income", label: t("netIncome"), amount: flow.incomeBase, kind: "in" },
                    { key: "fixed", label: t("behavioralClass.FIXED_CONTRACTUAL"), amount: flow.byBehavioral.FIXED_CONTRACTUAL, kind: "out" },
                    { key: "var", label: t("behavioralClass.VARIABLE_DISCRETIONARY"), amount: flow.byBehavioral.VARIABLE_DISCRETIONARY, kind: "out" },
                    { key: "drag", label: t("behavioralClass.FINANCIAL_DRAG"), amount: flow.leakageBase, kind: "out" },
                    { key: "debt", label: t("debtService"), amount: Math.max(0, flow.incomeBase - flow.expensesBase - (surplus.ok ? surplus.monthlyBase : 0)), kind: "out" },
                    { key: "surplus", label: t("verifiedSurplus"), amount: surplus.ok ? surplus.monthlyBase : 0, kind: "result" },
                  ]}
                />
                {!surplus.ok ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t(`refusal.${surplus.reason}`)}</p>
                ) : null}
                <p className="mt-3 text-xs text-neutral-500">{t("savingsNote", { amount: formatMoney(flow.savingsFlowsBase, baseCurrency, loc) })}</p>
                {flow.transfersExcludedBase > 0 ? (
                  <p className="mt-1 text-xs text-neutral-500">{t("transfersNote", { amount: formatMoney(flow.transfersExcludedBase, baseCurrency, loc) })}</p>
                ) : null}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold">{t("behavioralTitle")}</h3>
                <BehavioralBars
                  totals={flow.byBehavioral as unknown as Record<string, number>}
                  labels={Object.fromEntries(BEHAVIORAL.map((b) => [b, t(`behavioralClass.${b}`)]))}
                  locale={loc}
                  currency={baseCurrency}
                />
                <h3 className="mt-6 mb-3 text-sm font-semibold">{t("safeToSpendTitle")}</h3>
                {sts.ok ? (
                  <>
                    <p className="text-2xl font-semibold tabular-nums">{formatMoney(sts.safeToSpendBase, baseCurrency, loc)}</p>
                    <p className="mt-1 text-xs text-neutral-500">{t("safeToSpendHint", { days: sts.windowDays })}</p>
                    {computed.committedInstalmentsBase > 0 ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        {t("instalmentsCommitted", { amount: formatMoney(computed.committedInstalmentsBase, baseCurrency, loc) })}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t(`refusal.${sts.reason}`)}</p>
                )}
              </div>
            </div>

            {diag ? (
              <details className="mt-6 rounded-lg bg-neutral-50 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-neutral-700">
                  {t("diagTitle", { n: diag.total })}
                </summary>
                <p className="mt-2 text-neutral-600">{t("diagHint")}</p>
                <p className="mt-2 font-mono">
                  {t("diagSummary", {
                    booked: diag.booked, pending: diag.pending, voided: diag.voided,
                    inflow: diag.inflow, inflowTotal: diag.inflowTotal.toFixed(2),
                    transfers: diag.transfers, transferTotal: diag.transferTotal.toFixed(2),
                    savings: diag.savings, missingBase: diag.missingBase,
                  })}
                </p>
                <table className="mt-3 w-full">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="text-start">{t("date")}</th>
                      <th className="text-start">{t("amount")}</th>
                      <th className="text-start">{t("description")}</th>
                      <th className="text-start">{t("behavioral")}</th>
                      <th className="text-start">{t("category")}</th>
                      <th className="text-start">{t("diagCounted")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diag.rows.map((r) => {
                      const excluded =
                        r.status !== "BOOKED" || r.behavioral === "TRANSFER" || !r.hasBase;
                      return (
                        <tr key={r.id} className={excluded ? "text-neutral-400" : ""}>
                          <td className="whitespace-nowrap">{r.date}</td>
                          <td className={`tabular-nums ${r.amount > 0 ? "text-green-700" : ""}`}>{r.amount.toFixed(2)}</td>
                          <td className="max-w-56 truncate">{r.description}</td>
                          <td>{r.behavioral ? t(`behavioralClass.${r.behavioral}`) : "—"}</td>
                          <td>{r.category ?? "—"}</td>
                          <td>
                            {r.status !== "BOOKED"
                              ? t("diagNotBooked", { status: r.status })
                              : !r.hasBase
                                ? t("diagNoRate")
                                : r.behavioral === "TRANSFER"
                                  ? t("diagTransfer")
                                  : r.behavioral === "SAVINGS_FLOW"
                                    ? t("diagSavings")
                                    : t("diagYes")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            ) : null}

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold">{t("byCategoryTitle")}</h3>
                <CategoryTable
                  locale={loc}
                  currency={baseCurrency}
                  emptyLabel={t("noCategoryTotals")}
                  rows={flow.byCategory.slice(0, 12).map((c) => ({
                    categoryId: c.categoryId,
                    label: (() => {
                      const m = byId.get(c.categoryId);
                      return m ? (locale === "he" ? m.nameHe : m.nameEn) : c.categoryKey;
                    })(),
                    amountBase: c.amountBase,
                  }))}
                />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold">{t("workingCapitalTitle")}</h3>
                <ul className="text-sm">
                  <li className="flex justify-between border-b border-neutral-100 py-1.5">
                    <span>{t("wcAvailable")}</span>
                    <span className="tabular-nums">{formatMoney(computed.workingCapital.availableBase, baseCurrency, loc)}</span>
                  </li>
                  <li className="flex justify-between border-b border-neutral-100 py-1.5">
                    <span>{t("wcTarget")}</span>
                    <span className="tabular-nums">{formatMoney(computed.workingCapital.targetBase, baseCurrency, loc)}</span>
                  </li>
                  <li className="flex justify-between py-1.5 font-medium">
                    <span>{t("wcGap")}</span>
                    <span className={`tabular-nums ${computed.workingCapital.gapBase > 0 ? "text-amber-700" : "text-green-700"}`}>
                      {formatMoney(computed.workingCapital.gapBase, baseCurrency, loc)}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </>
        )}
      </Card>

      <div id="suspense" />
      <Card title={t("suspenseTitle")}>
        <p className="mb-4 text-xs text-neutral-500">{t("suspenseHint", { threshold: Math.round(suspense.minConfidence * 100) })}</p>
        {suspense.rows.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("suspenseEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {suspense.rows.map((tx) => {
              const cls = tx.classifications[0];
              const amount = Number(tx.amount);
              return (
                <div key={tx.id} className="rounded-xl border border-neutral-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-words">{tx.descriptionRedacted}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {new Date(tx.bookedAt).toISOString().slice(0, 10)}
                        {" · "}
                        {tx.category ? (locale === "he" ? tx.category.nameHe : tx.category.nameEn) : t("unclassifiedBadge")}
                        {" · "}
                        {t("confidence")}: {Math.round(Number(cls?.confidence ?? 0) * 100)}%
                      </p>
                    </div>
                    {/* The amount was missing entirely - it is the single most useful
                        signal when deciding what a transaction actually was. */}
                    <span className={`shrink-0 text-lg font-semibold tabular-nums ${amount < 0 ? "text-neutral-800" : "text-green-700"}`}>
                      {amount > 0 ? "+" : ""}{formatMoney(Math.abs(amount), tx.currency, loc)}
                    </span>
                  </div>

                  <form action={bulkClassifyMerchantAction} className="mt-3 flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-3">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="merchantKey" value={tx.merchantKey ?? ""} />
                    <div className="min-w-64 flex-1">
                      <Field label={t("category")}>
                        <CategoryPicker
                          name="category"
                          categories={pickerCats}
                          locale={locale}
                          defaultCategoryId={tx.categoryId}
                          placeholder={t("categoryOrPick")}
                          required
                          listId="cats-all"
                        />
                      </Field>
                    </div>
                    <Field label={t("behavioral")}>
                      <Select name="behavioralClass" defaultValue={tx.behavioralClass ?? "VARIABLE_DISCRETIONARY"}>
                        {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
                      </Select>
                    </Field>
                    {tx.merchantKey ? (
                      <button type="submit" className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
                        {t("applyToMerchant")}
                      </button>
                    ) : (
                      <span className="flex items-center gap-2 whitespace-nowrap text-xs text-neutral-500">
                        {t("noMerchantKey")}
                        <a href={`/${locale}/operations?edit=${tx.id}`} className="text-blue-600 underline">
                          {t("editInstead")}
                        </a>
                      </span>
                    )}
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={t("addTransaction")}>
        <p className="mb-4 text-xs text-neutral-500">{t("addTransactionHint")}</p>
        <form action={createManualTransactionAction} className="grid max-w-4xl grid-cols-2 items-end gap-4 md:grid-cols-3">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("date")}>
            <TextInput name="bookedAt" type="date" defaultValue={today} required />
          </Field>
          <Field label={t("direction")}>
            <Select name="direction" defaultValue="OUT">
              <option value="OUT">{t("directionOut")}</option>
              <option value="IN">{t("directionIn")}</option>
            </Select>
          </Field>
          <Field label={t("amount")}>
            <TextInput name="amount" inputMode="decimal" required placeholder="0.00" />
          </Field>
          <Field label={t("currency")}>
            <Select name="currency" defaultValue="ILS">
              {["ILS", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t("description")}>
            <TextInput name="description" required maxLength={400} />
          </Field>
          <Field label={t("category")}>
            <CategoryPicker
              name="category"
              categories={pickerCats}
              locale={locale}
              placeholder={t("categoryOrPick")}
              listId="cats-create"
            />
          </Field>
          <Field label={t("behavioral")}>
            <Select name="behavioralClass" defaultValue="">
              <option value="">{t("behavioralFromCategory")}</option>
              {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("instalmentNumber")}>
            <TextInput name="instalmentNumber" inputMode="numeric" placeholder="1" />
          </Field>
          <Field label={t("instalmentTotal")}>
            <TextInput name="instalmentTotal" inputMode="numeric" placeholder="3" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isRecurringCandidate" />
            <span className="text-neutral-600">{t("recurring")}</span>
          </label>
          <SubmitButton label={t("save")} />
        </form>
      </Card>

      <Card title={t("transactions")}>
        <p className="mb-4 text-xs text-neutral-500">{t("transactionsHint")}</p>
        {txns.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("noTransactions")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {txns.map((tx) => {
              const cat = tx.categoryId ? byId.get(tx.categoryId) : undefined;
              const amount = Number(tx.amount);
              const cls = tx.classifications[0];
              const isEditing = sp.edit === tx.id;
              const voided = tx.status === "VOID";
              return (
                <div
                  id={`tx-${tx.id}`}
                  key={tx.id}
                  className={`rounded-xl border p-4 ${voided ? "border-neutral-200 bg-neutral-50 opacity-60" : "border-neutral-200"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span>{tx.descriptionRedacted}</span>
                        {voided ? (
                          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600">{t("removedBadge")}</span>
                        ) : null}
                        {tx.instalmentTotal ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                            {t("instalmentBadge", { n: tx.instalmentNumber ?? 1, total: tx.instalmentTotal })}
                          </span>
                        ) : null}
                        {tx.isRecurringCandidate ? (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{t("recurringBadge")}</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {new Date(tx.bookedAt).toISOString().slice(0, 10)}
                        {" · "}
                        {cat ? (locale === "he" ? cat.nameHe : cat.nameEn) : t("unclassifiedBadge")}
                        {tx.behavioralClass ? ` · ${t(`behavioralClass.${tx.behavioralClass}`)}` : ""}
                      </p>
                      {/* Provenance: why does this row have this category? */}
                      {cls ? (
                        <p className="mt-1 text-xs text-neutral-400">
                          {t("provenance", {
                            method: t(`method.${cls.method}`),
                            confidence: Math.round(Number(cls.confidence) * 100),
                          })}
                          {cls.decidedBy ? ` · ${cls.decidedBy}` : ""}
                          {cls.ruleVersion ? ` · ${cls.ruleVersion}` : ""}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-neutral-400">{t("provenanceNone")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`whitespace-nowrap tabular-nums ${amount < 0 ? "text-neutral-800" : "text-green-700"}`}>
                        {formatMoney(Math.abs(amount), tx.currency, loc)}
                      </span>
                      {isEditing ? (
                        <a href={`/${locale}/operations`} className="text-xs text-neutral-500 underline">{t("cancel")}</a>
                      ) : (
                        <a href={`/${locale}/operations?edit=${tx.id}`} className="text-xs text-blue-600 underline">{t("edit")}</a>
                      )}
                      <form action={setTransactionStatusAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="id" value={tx.id} />
                        <input type="hidden" name="status" value={voided ? "BOOKED" : "VOID"} />
                        <button type="submit" className="text-xs text-neutral-500 underline">
                          {voided ? t("restore") : t("remove")}
                        </button>
                      </form>
                    </div>
                  </div>

                  {isEditing ? (
                    <form action={updateTransactionAction} className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-neutral-100 pt-4 md:grid-cols-4">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={tx.id} />
                      <Field label={t("date")}>
                        <TextInput name="bookedAt" type="date" defaultValue={new Date(tx.bookedAt).toISOString().slice(0, 10)} required />
                      </Field>
                      <Field label={t("direction")}>
                        <Select name="direction" defaultValue={amount < 0 ? "OUT" : "IN"}>
                          <option value="OUT">{t("directionOut")}</option>
                          <option value="IN">{t("directionIn")}</option>
                        </Select>
                      </Field>
                      <Field label={t("amount")}>
                        <TextInput name="amount" inputMode="decimal" defaultValue={Math.abs(amount)} required />
                      </Field>
                      <Field label={t("currency")}>
                        <Select name="currency" defaultValue={tx.currency}>
                          {["ILS", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </Field>
                      <Field label={t("description")}>
                        <TextInput name="description" defaultValue={tx.descriptionRedacted} required maxLength={400} />
                      </Field>
                      <Field label={t("category")}>
                        <CategoryPicker
                          name="category"
                          categories={pickerCats}
                          locale={locale}
                          defaultCategoryId={tx.categoryId}
                          placeholder={t("categoryOrPick")}
                          listId="cats-all"
                        />
                      </Field>
                      <Field label={t("behavioral")}>
                        <Select name="behavioralClass" defaultValue={tx.behavioralClass ?? ""}>
                          <option value="">{t("behavioralFromCategory")}</option>
                          {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
                        </Select>
                      </Field>
                      <Field label={t("instalmentNumber")}>
                        <TextInput name="instalmentNumber" inputMode="numeric" defaultValue={tx.instalmentNumber ?? ""} />
                      </Field>
                      <Field label={t("instalmentTotal")}>
                        <TextInput name="instalmentTotal" inputMode="numeric" defaultValue={tx.instalmentTotal ?? ""} />
                      </Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="isRecurringCandidate" defaultChecked={tx.isRecurringCandidate} />
                        <span className="text-neutral-600">{t("recurring")}</span>
                      </label>
                      <SubmitButton label={t("saveChanges")} />
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div id="categories" />
      <Card title={t("categories")}>
        <p className="mb-4 text-xs text-neutral-500">{t("categoriesHint", { count: flat.length })}</p>
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          {(["EXPENSE", "INCOME"] as const).map((axis) => (
            <div key={axis}>
              <h3 className="mb-2 text-sm font-semibold">{t(`axis.${axis}`)}</h3>
              <ul className="text-sm">
                {flat.filter((c) => c.axis === axis).map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b border-neutral-100 py-1">
                    <span style={{ paddingInlineStart: `${(c.key.split(".").length - 1) * 12}px` }}>
                      {locale === "he" ? c.nameHe : c.nameEn}
                    </span>
                    <span className="text-xs text-neutral-400">{t(`behavioralClass.${c.defaultBehavioralClass}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <form action={upsertCategoryAction} className="grid max-w-4xl grid-cols-2 items-end gap-4 md:grid-cols-3">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("axisLabel")}>
            <Select name="axis" defaultValue="EXPENSE">
              <option value="EXPENSE">{t("axis.EXPENSE")}</option>
              <option value="INCOME">{t("axis.INCOME")}</option>
            </Select>
          </Field>
          <Field label={t("parent")}>
            <CategoryPicker
              name="parent"
              categories={pickerCats}
              locale={locale}
              placeholder={t("noParent")}
              listId="cats-all"
            />
          </Field>
          <Field label={t("categoryKey")}>
            <TextInput name="key" required placeholder="food.bakery" />
          </Field>
          <Field label={t("nameEn")}><TextInput name="nameEn" required /></Field>
          <Field label={t("nameHe")}><TextInput name="nameHe" required /></Field>
          <Field label={t("behavioral")}>
            <Select name="defaultBehavioralClass" defaultValue="VARIABLE_DISCRETIONARY">
              {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
            </Select>
          </Field>
          <SubmitButton label={t("addCategory")} />
        </form>
      </Card>

      <p className="text-xs text-neutral-400">{t("engineVersion", { version: meta.engineVersion })}</p>
    </div>
  );
}
