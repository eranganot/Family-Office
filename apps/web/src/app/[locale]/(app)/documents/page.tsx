import { formatDate, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { runImportAction, setDocTypeAction, uploadDocumentAction } from "../../../../lib/actions/import-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

const DOC_TYPES = [
  "PENSION_REPORT", "HISHTALMUT_STATEMENT", "GEMEL_STATEMENT", "BANK_STATEMENT",
  "BROKERAGE_STATEMENT", "MISLAKA", "MORTGAGE_SCHEDULE", "TAX_106", "OTHER",
] as const;

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
  const members = household?.members ?? [];

  const reportBatch = report
    ? (await trpc.imports.batches()).find((b) => b.id === report)
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("upload")}>
        <ErrorBanner message={error ? `${tf("error")}: ${decodeURIComponent(error)}` : undefined} />
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
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{doc.filename}</span>
                    <span className="ms-2 text-xs text-neutral-400">
                      {doc.docType ? t(`types.${doc.docType}`) : ""} · {t("status")}: {doc.parseStatus} ·{" "}
                      {formatDate(doc.uploadedAt, locale as Locale)}
                    </span>
                  </div>
                </div>
                <form action={setDocTypeAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="documentId" value={doc.id} />
                  <Field label={t("docType")}>
                    <Select name="docType" defaultValue={doc.docType ?? "OTHER"}>
                      {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`types.${d}`)}</option>)}
                    </Select>
                  </Field>
                  <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">{t("updateDocType")}</button>
                </form>
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
              </li>
            ))}
          </ul>
        )}
      </Card>

      {suspense.length > 0 ? (
        <Card title={`${t("pendingSuspense")} (${suspense.length})`}>
          <p className="mb-3 text-xs text-neutral-500">{t("suspenseNote")}</p>
          <ul className="flex flex-col gap-2 text-sm">
            {suspense.map((s) => (
              <li key={s.id} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <a href={`/${locale}/verification/suspense/${s.id}`} className="underline">
                  <span className="font-medium text-amber-800">{t("reason")}: {s.reason}</span>
                </a>
                <span className="ms-2 text-xs text-amber-600">{s.batch.document?.filename}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
