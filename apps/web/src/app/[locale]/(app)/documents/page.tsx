import { formatDate, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { discardSuspenseBatchAction, runImportAction, setDocTypeAction, uploadDocumentAction } from "../../../../lib/actions/import-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

/**
 * ⚠️ Must stay in step with `DocTypeSchema` in the API. CARD_STATEMENT was in the schema
 * and missing HERE, so a credit-card statement could only be typed from the Operations
 * upload form and not from this page — the same one-word omission that once rejected
 * every card upload outright.
 */
const DOC_TYPES = [
  "PENSION_REPORT", "HISHTALMUT_STATEMENT", "GEMEL_STATEMENT", "BANK_STATEMENT",
  "CARD_STATEMENT", "BROKERAGE_STATEMENT", "MISLAKA", "MORTGAGE_SCHEDULE", "TAX_106", "OTHER",
] as const;

/** Error codes this page can explain. Anything else is shown verbatim. */
const KNOWN_ERRORS = ["NO_ADAPTER_FOUND", "TRANSACTIONS_CSV_NOT_ACCOUNTS"];

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; report?: string }>;
}) {
  const { locale } = await params;
  const { error, report } = await searchParams;
  const t = await getTranslations("documents");
  const tf = await getTranslations("forms");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  const documents = household ? await trpc.documents.list() : [];
  const suspense = household ? await trpc.imports.suspense() : [];
  // Which documents an adapter can actually parse. One query for the whole list.
  const importableIds = household ? await trpc.imports.importableIds() : [];
  const members = household?.members ?? [];

  const reportBatch = report
    ? (await trpc.imports.batches()).find((b) => b.id === report)
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("upload")}>
        {/*
          The banner used to render the raw code — the owner saw "השמירה נכשלה:
          NO_ADAPTER_FOUND" under the UPLOAD heading for an error raised by IMPORT, and
          reasonably concluded his file had not been saved. It had been.

          Known codes are translated into what actually happened and what it means for
          the document. An unknown code still shows verbatim rather than being swallowed:
          a code I cannot explain is more useful than a generic apology.
        */}
        <ErrorBanner
          message={
            error
              ? KNOWN_ERRORS.includes(decodeURIComponent(error))
                ? t(`error${decodeURIComponent(error)}`)
                : `${tf("error")}: ${decodeURIComponent(error)}`
              : undefined
          }
        />
        <form action={uploadDocumentAction} className="grid max-w-2xl grid-cols-2 items-end gap-4">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("file")}>
            <input type="file" name="file" required accept=".pdf,.csv,application/pdf,text/csv" className="text-sm" />
          </Field>
          <Field label={t("docType")}>
            <Select name="docType" defaultValue="OTHER">
              {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`types.${d}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("institution")}>
            <TextInput name="institutionName" />
          </Field>
          <div><SubmitButton label={t("uploadBtn")} /></div>
        </form>
      </Card>

      {reportBatch ? (
        <Card title={t("report")}>
          <ul className="flex flex-col gap-1 text-sm">
            <li>{t("provenance")}: <span className="font-medium">{reportBatch._count.importedFields}</span></li>
            <li>{t("suspense")}: <span className="font-medium">{reportBatch._count.suspenseItems}</span></li>
            <li className="text-neutral-400">{reportBatch.adapterId} v{reportBatch.adapterVersion} · {reportBatch.status}</li>
          </ul>
        </Card>
      ) : null}

      <Card title={t("docs")}>
        {documents.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-lg border border-neutral-100 p-3">
                {/*
                  THE STORED TYPE, STATED. The row used to print the saved docType as
                  small grey text and NOTHING AT ALL when it was null — while the dropdown
                  below defaulted to "OTHER" whether or not anything had been saved.

                  So a document with no type looked identical to one typed OTHER, and a
                  dropdown you had changed but not SUBMITTED looked identical to one that
                  had been saved. Owner reported his documents were "all there and
                  correctly typed" while the report found none of those types — this is
                  how both statements can be true at once.

                  An unset type now says so, in red, next to the filename.
                */}
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{doc.filename}</span>
                    {doc.docType ? (
                      <span className="ms-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                        {t(`types.${doc.docType}`)}
                      </span>
                    ) : (
                      <span className="ms-2 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        {t("typeNotSet")}
                      </span>
                    )}
                    <span className="ms-2 text-xs text-neutral-400">
                      {t("status")}: {doc.parseStatus} · {formatDate(doc.uploadedAt, locale as Locale)}
                    </span>
                  </div>
                </div>
                <form action={setDocTypeAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="documentId" value={doc.id} />
                  <Field label={t("docType")}>
                    {/*
                      Defaulting an UNSET type to "OTHER" made the dropdown assert a
                      value the database did not hold, and "OTHER" satisfies no
                      expectation rule — so a document that looked correctly typed
                      counted for nothing. An unset document now shows an explicit
                      placeholder that cannot be mistaken for a saved value.
                    */}
                    <Select name="docType" defaultValue={doc.docType ?? ""}>
                      {doc.docType ? null : <option value="">{t("chooseType")}</option>}
                      {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`types.${d}`)}</option>)}
                    </Select>
                  </Field>
                  <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">{t("updateDocType")}</button>
                  {/* The change is not saved until this is pressed — and nothing said so. */}
                  <span className="text-xs text-neutral-400">{t("updateDocTypeHint")}</span>
                </form>
                {/*
                  Only offer the import form where an adapter can actually parse the file.

                  Owner QA: assigning ownership failed on EVERY document with a bare
                  NO_ADAPTER_FOUND. Only two adapters exist, so a PDF typed
                  MORTGAGE_SCHEDULE, TAX_106 or BANK_STATEMENT matches none of them. The
                  document had been stored correctly all along - only the parse was
                  impossible - but a red "save failed" says the filing failed.

                  Since per-item attribution landed, a document is EVIDENCE whether or not
                  anything can read it: a mortgage schedule nobody can parse still proves
                  the mortgage. So an unparseable document is a normal, complete state,
                  and it says so instead of offering a button that cannot work.
                */}
                {importableIds.includes(doc.id) ? (
                  <form action={runImportAction} className="mt-2 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <fieldset className="flex items-end gap-2">
                      <legend className="mb-1 text-xs text-neutral-500">{t("importOwnership")}</legend>
                      {members.map((m, i) => (
                        <label key={m.id} className="flex flex-col gap-1 text-xs">
                          {m.name}
                          <TextInput
                            name={`own_${m.id}`}
                            inputMode="decimal"
                            defaultValue={members.length === 1 && i === 0 ? "100" : ""}
                            placeholder="0"
                          />
                        </label>
                      ))}
                    </fieldset>
                    <SubmitButton label={t("runImport")} />
                  </form>
                ) : (
                  <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                    {t("noParserStored")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {suspense.length > 0 ? (
        <Card title={`${t("pendingSuspense")} (${suspense.length})`}>
          <p className="mb-3 text-xs text-neutral-500">{t("suspenseNote")}</p>
          {/*
            Grouped BY BATCH, with a bulk discard per batch.

            Owner QA: 54 rows, every one reading "Reason: UNKNOWN_ACCOUNT_TYPE" over the
            same filename, with no way to tell them apart and no way to clear them except
            54 individual discards. His question was the right one - "what am I even
            looking at, and where do I map it?" - and the list gave him nothing to answer
            it with.

            So each row now shows a preview of the raw data it refused to guess about,
            and each batch can be cleared in one action. Pending suspense is load-bearing:
            it is what keeps every closed month provisional, which is what makes the
            surplus hand-off refuse to deploy anything.
          */}
          {Object.entries(
            suspense.reduce<Record<string, typeof suspense>>((acc, s) => {
              const key = s.batchId;
              (acc[key] ??= []).push(s);
              return acc;
            }, {}),
          ).map(([batchId, rows]) => (
            <div key={batchId} className="mb-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-700">
                  {rows[0]!.batch.document?.filename ?? batchId} · {rows.length}
                </span>
                <form action={discardSuspenseBatchAction} className="flex items-end gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="batchId" value={batchId} />
                  <TextInput name="note" placeholder={t("discardNotePlaceholder")} />
                  <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs">
                    {t("discardBatch", { count: rows.length })}
                  </button>
                </form>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {rows.slice(0, 10).map((s) => (
                  <li key={s.id} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                    <a href={`/${locale}/verification/suspense/${s.id}`} className="underline">
                      <span className="font-medium text-amber-800">{t("reason")}: {s.reason}</span>
                    </a>
                    {/* The raw row it refused to guess about. Without this every entry
                        looks identical and the queue is unreadable. */}
                    <span className="ms-2 text-xs text-amber-700" dir="auto">
                      {Object.entries((s.rawData ?? {}) as Record<string, unknown>)
                        .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
                        .slice(0, 4)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
              {rows.length > 10 ? (
                <p className="mt-2 text-xs text-neutral-500">{t("suspenseTruncated", { count: rows.length - 10 })}</p>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
