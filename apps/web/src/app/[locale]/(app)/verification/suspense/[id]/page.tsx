import { getTranslations } from "next-intl/server";
import {
  createFromSuspenseAction,
  discardSuspenseAction,
  linkSuspenseAction,
} from "../../../../../../lib/actions/suspense-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput } from "../../../../../../components/fields";
import { serverCaller } from "../../../../../../lib/trpc-server";

const ACCOUNT_TYPES = [
  "BANK_CHECKING", "BANK_SAVINGS", "BANK_DEPOSIT", "BROKERAGE_IL", "BROKERAGE_FOREIGN",
  "PENSION_COMPREHENSIVE", "PENSION_GENERAL", "KUPAT_GEMEL", "GEMEL_LEHASHKAA",
  "KEREN_HISHTALMUT", "IRA_GEMEL", "FOREIGN_RETIREMENT", "CASH_OTHER",
] as const;

interface RawItemShape {
  suggestedName?: string;
  externalRef?: string;
  fields?: Array<{ path: string; rawValue: string; normalizedValue?: string }>;
}

export default async function SuspenseResolvePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale, id } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("suspense");
  const tf = await getTranslations("forms");
  const trpc = await serverCaller();
  const item = await trpc.suspense.get({ id });
  const household = await trpc.household.get();
  const members = household?.members ?? [];
  const ledgerItems = await trpc.ledger.list();

  const raw = item.rawData as RawItemShape;
  const fieldValue = (path: string) =>
    raw.fields?.find((f) => f.path === path)?.normalizedValue ??
    raw.fields?.find((f) => f.path === path)?.rawValue;

  return (
    <div className="flex flex-col gap-6">
      <Card title={`${t("title")} — ${item.reason}`}>
        <ErrorBanner message={error ? `${tf("error")}: ${decodeURIComponent(error)}` : undefined} />
        <p className="mb-2 text-xs text-neutral-400">
          {t("source")}: {item.batch.document?.filename ?? "-"}
        </p>
        <p className="mb-1 text-xs font-medium text-neutral-500">{t("raw")}</p>
        <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs" dir="ltr">
          {JSON.stringify(raw, null, 2)}
        </pre>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title={t("discard")}>
          <form action={discardSuspenseAction} className="flex items-end gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={id} />
            <TextInput name="note" placeholder={t("discardNote")} required />
            <button type="submit" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {t("discard")}
            </button>
          </form>
        </Card>
        <Card title={t("link")}>
          <form action={linkSuspenseAction} className="flex items-end gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={id} />
            <Select name="ledgerItemId" required>
              {ledgerItems.map((li) => (
                <option key={li.id} value={li.id}>{li.name}</option>
              ))}
            </Select>
            <SubmitButton label={t("linkBtn")} />
          </form>
        </Card>
      </div>

      <Card title={t("createTitle")}>
        <p className="mb-3 text-xs text-neutral-500">{t("createHint")}</p>
        <form action={createFromSuspenseAction} className="grid max-w-2xl grid-cols-2 gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="id" value={id} />
          <Field label={tf("name")}>
            <TextInput name="name" defaultValue={raw.suggestedName ?? ""} required />
          </Field>
          <Field label={tf("currency")}>
            <Select name="currency" defaultValue="ILS">
              {["ILS", "USD", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={tf("account.accountType")}>
            <Select name="accountType" defaultValue={fieldValue("accountType") ?? "CASH_OTHER"}>
              {ACCOUNT_TYPES.map((a) => <option key={a} value={a}>{tf(`accountTypes.${a}`)}</option>)}
            </Select>
          </Field>
          <Field label={tf("account.institution")}>
            <TextInput name="institutionName" defaultValue={fieldValue("institutionName") ?? ""} required />
          </Field>
          <Field label={tf("account.accountNumberMasked")}>
            <TextInput name="accountNumberMasked" defaultValue={raw.externalRef ?? ""} />
          </Field>
          <Field label={tf("account.managementFeePct")}>
            <TextInput name="managementFeePct" defaultValue={fieldValue("managementFeePct") ?? ""} />
          </Field>
          <Field label={tf("value")}>
            <TextInput name="value" inputMode="decimal" defaultValue={fieldValue("balance") ?? ""} />
          </Field>
          <Field label={tf("valueDate")}>
            <TextInput name="valueDate" type="date" defaultValue={fieldValue("balanceAsOf") ?? new Date().toISOString().slice(0, 10)} />
          </Field>
          <fieldset className="col-span-2">
            <legend className="mb-1 text-sm text-neutral-600">{tf("ownership")}</legend>
            <div className="grid grid-cols-2 gap-3">
              {members.map((m, i) => (
                <Field key={m.id} label={m.name}>
                  <TextInput name={`own_${m.id}`} inputMode="decimal" defaultValue={members.length === 1 && i === 0 ? "100" : ""} />
                </Field>
              ))}
            </div>
          </fieldset>
          <div className="col-span-2">
            <SubmitButton label={tf("submit")} />
          </div>
        </form>
      </Card>
    </div>
  );
}
