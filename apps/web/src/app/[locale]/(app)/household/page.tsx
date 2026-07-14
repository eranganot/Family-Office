import { formatDate, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import {
  addMemberAction,
  archiveMemberAction,
  bootstrapHouseholdAction,
  updateMemberAction,
} from "../../../../lib/actions/household-actions";
import { Card, ErrorBanner, Field, Select, SubmitButton, TextInput, SuccessBanner } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

export default async function HouseholdPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { locale } = await params;
  const { error, ok } = await searchParams;
  const t = await getTranslations("household");
  const tf = await getTranslations("forms");
  const tok = await getTranslations("ok");
  const trpc = await serverCaller();
  const household = await trpc.household.get();

  if (!household) {
    return (
      <Card title={t("title")}>
        <ErrorBanner message={error ? tf("error") : undefined} />
        <form action={bootstrapHouseholdAction} className="mt-2 flex max-w-md flex-col gap-4">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("name")}>
            <TextInput name="name" required />
          </Field>
          <Field label={t("baseCurrency")}>
            <Select name="baseCurrency" defaultValue="ILS">
              <option value="ILS">ILS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
          </Field>
          <Field label={t("timezone")}>
            <TextInput name="timezone" defaultValue="Asia/Jerusalem" />
          </Field>
          <SubmitButton label={t("create")} />
        </form>
      </Card>
    );
  }

  const roles = ["ADULT", "CHILD"] as const;
  const employment = ["EMPLOYED", "SELF_EMPLOYED", "UNEMPLOYED", "RETIRED", "STUDENT", "MINOR"] as const;

  return (
    <div className="flex flex-col gap-6">
      <Card title={household.name}>
        <p className="text-sm text-neutral-500">
          {t("baseCurrency")}: {household.baseCurrency} · {t("timezone")}: {household.timezone}
        </p>
      </Card>
      <Card title={t("members")}>
        <ErrorBanner message={error ? tf("error") : undefined} />
        <SuccessBanner message={ok && ["memberAdded","memberSaved","memberArchived"].includes(ok) ? tok(ok) : undefined} />
        <ul className="mb-6 flex flex-col gap-2">
          {household.members.map((m) => (
            <li key={m.id} className="rounded-lg border border-neutral-100 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{m.name}</span> · {t(m.role)}
                  {m.birthDate ? <span className="text-neutral-400"> · {formatDate(m.birthDate, locale as Locale)}</span> : null}
                </span>
                <form action={archiveMemberAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="text-xs text-neutral-400 underline">
                    {t("archive")}
                  </button>
                </form>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-blue-600 underline">{tf("edit")}</summary>
                <form action={updateMemberAction} className="mt-3 grid max-w-2xl grid-cols-2 gap-3 rounded-lg bg-neutral-50 p-3">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={m.id} />
                  <Field label={t("memberName")}>
                    <TextInput name="name" defaultValue={m.name} required />
                  </Field>
                  <Field label={t("role")}>
                    <Select name="role" defaultValue={m.role}>
                      {roles.map((r) => (
                        <option key={r} value={r}>{t(r)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("birthDate")}>
                    <TextInput name="birthDate" type="date" defaultValue={m.birthDate ? new Date(m.birthDate).toISOString().slice(0, 10) : ""} />
                  </Field>
                  <Field label={t("employmentStatus")}>
                    <Select name="employmentStatus" defaultValue={m.employmentStatus ?? ""}>
                      <option value=""></option>
                      {employment.map((e) => (
                        <option key={e} value={e}>{t(e)}</option>
                      ))}
                    </Select>
                  </Field>
                  <div className="col-span-2">
                    <SubmitButton label={tf("submit")} />
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
        <form action={addMemberAction} className="grid max-w-2xl grid-cols-2 gap-4">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("memberName")}>
            <TextInput name="name" required />
          </Field>
          <Field label={t("role")}>
            <Select name="role">
              {roles.map((r) => (
                <option key={r} value={r}>{t(r)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("birthDate")}>
            <TextInput name="birthDate" type="date" />
          </Field>
          <Field label={t("employmentStatus")}>
            <Select name="employmentStatus" defaultValue="">
              <option value=""></option>
              {employment.map((e) => (
                <option key={e} value={e}>{t(e)}</option>
              ))}
            </Select>
          </Field>
          <div className="col-span-2">
            <SubmitButton label={t("addMember")} />
          </div>
        </form>
      </Card>
    </div>
  );
}
