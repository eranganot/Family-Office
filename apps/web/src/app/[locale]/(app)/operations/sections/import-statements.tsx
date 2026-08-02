import { getTranslations } from "next-intl/server";
import { Card, Field, Select, SubmitButton, TextInput } from "../../../../../components/fields";
import {
  commitAllPendingAction,
  commitStatementAction,
  resetAllImportsAction,
  undoImportAction,
  uploadStatementAction,
} from "../../../../../lib/actions/operations-actions";

/**
 * M42b — statement import, extracted from `operations/page.tsx` and moved to
 * `/transactions`.
 *
 * It belongs with the classification layer rather than on Today: import is what FEEDS
 * the list, the category tree and the suspense queue. Every row it creates lands in all
 * three, so putting it anywhere else means the owner imports on one page and discovers
 * the consequences on another.
 *
 * All self-links now point at `/transactions` — the preview links especially, since a
 * preview that bounced to Today would strand the owner on a page with no importer.
 */

export interface PendingDoc {
  id: string;
  filename: string;
}

export interface ImportBatchRow {
  id: string;
  adapterId: string;
  startedAt: string | Date;
  document: { filename: string } | null;
  _count: { transactions: number };
}

export interface PreviewView {
  /*
   * `undefined`, NOT `null`. The repo runs with `exactOptionalPropertyTypes: true`, so
   * an optional property typed `string | null` will not accept the actual
   * `string | undefined` — the two are distinct and tsc rejected the assignment. Every
   * optional below follows the same rule.
   */
  unsupportedReason?: string | undefined;
  totalRows: number;
  duplicates: number;
  encoding: string;
  format: string;
  headers: string[];
  redactedFields: number;
  redactionVersion: string;
  inflowCount: number;
  outflowCount: number;
  inflowTotal: number;
  outflowTotal: number;
  statementTotal?: number | undefined;
  parsedTotal?: number | undefined;
  reconciles?: boolean | undefined;
  detectedRange?: { start: string; end: string; days: number } | undefined;
  guessedMapping: Record<string, unknown>;
  issues: Array<{ reason: string; raw: string }>;
  drafts: Array<{
    externalRef?: string | undefined;
    bookedAt: string;
    descriptionRedacted: string;
    status: string;
    amount: string;
    currency: string;
    instalmentNumber?: number | undefined;
    instalmentTotal?: number | undefined;
  }>;
}

export interface ImportSectionProps {
  locale: string;
  pending: PendingDoc[];
  batches: ImportBatchRow[];
  preview: PreviewView | null;
  /** Surfaced, never swallowed — see the page comment on why this is not `catch(() => null)`. */
  previewError: string | null;
  previewingId?: string | undefined;
  uploadedCount?: string | undefined;
  failedCount?: string | undefined;
  reusedCount?: string | undefined;
}

export async function ImportSection({
  locale,
  pending,
  batches,
  preview,
  previewError,
  previewingId,
  uploadedCount,
  failedCount,
  reusedCount,
}: ImportSectionProps) {
  const t = await getTranslations("operations");
  const base = `/${locale}/transactions`;

  return (
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

      {uploadedCount ? (
        <p className="mt-3 text-xs text-neutral-600">
          {t("uploadedCount", { n: uploadedCount, failed: failedCount ?? "0" })}
          {reusedCount && reusedCount !== "0" ? ` ${t("alreadyUploaded", { n: reusedCount })}` : ""}
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
                  href={`${base}?preview=${d.id}`}
                  className={`shrink-0 underline ${previewingId === d.id ? "text-neutral-400" : "text-blue-600"}`}
                >
                  {previewingId === d.id ? t("previewing") : t("previewThis")}
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
            {/*
              QA: the preview never named the file it came from. With three statements
              pending, an owner clicking each in turn saw three identical-looking tables
              and could not tell whether the page had updated, whether he had clicked the
              right link, or whether two files genuinely hold the same rows. A preview you
              cannot attribute is not a check — it is a wall of numbers.

              The filename comes from the pending list rather than a new fetch, and the
              document id is shown too: two exports of the same statement saved seconds
              apart have different bytes and identical contents, and the id is the only
              thing that distinguishes them on screen.
            */}
            <h3 className="mb-1 text-sm font-semibold">{t("previewTitle")}</h3>
            <p className="mb-3 rounded bg-blue-50 px-3 py-2 text-xs text-blue-900">
              {t("previewOf", {
                filename:
                  pending.find((d) => d.id === previewingId)?.filename ?? t("previewUnknownFile"),
                id: (previewingId ?? "").slice(0, 8),
              })}
            </p>
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
                <input type="hidden" name="documentId" value={previewingId ?? ""} />
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
                <input type="hidden" name="documentId" value={previewingId ?? ""} />
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
  );
}
