import { getTranslations } from "next-intl/server";
import { setAssumptionAction } from "../../../../lib/actions/registry-actions";
import { Card, ErrorBanner, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

interface RuleMeta {
  sources?: string[];
  notes?: string[];
  ownerReviewed?: boolean;
}

export default async function RegistryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; year?: string }>;
}) {
  const { locale } = await params;
  const { error, year } = await searchParams;
  const t = await getTranslations("registry");
  const tf = await getTranslations("forms");
  const trpc = await serverCaller();
  const assumptions = await trpc.registry.assumptions();
  const years = await trpc.registry.taxYears();
  const activeYear = year ? Number(year) : (years[0] ?? 2026);
  const rules = years.length > 0 ? await trpc.registry.taxRules({ taxYear: activeYear }) : [];

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("assumptions")}>
        <details className="mb-4 rounded-lg bg-blue-50/50 p-3 text-sm text-neutral-700">
          <summary className="cursor-pointer font-medium text-blue-700">{t("explainerTitle")}</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <p>{t("explainer1")}</p>
            <p>{t("explainer2")}</p>
            <p>{t("explainer3")}</p>
          </div>
        </details>
        <ErrorBanner message={error ? tf("error") : undefined} />
        <p className="mb-4 text-xs text-neutral-500">{t("assumptionsHint")}</p>
        <ul className="flex flex-col gap-3">
          {assumptions.map((a) => (
            <li key={a.key} className="rounded-lg border border-neutral-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{a.key}</span>
                  <span className="ms-2 text-xs text-neutral-400">{a.description}</span>
                </div>
                <span className="text-xs text-neutral-400">
                  v{a.version} · {a.isOverride ? "USER" : a.source}
                </span>
              </div>
              <div className="mt-2 flex items-end gap-3">
                <code className="rounded bg-neutral-50 px-2 py-1 text-xs" dir="ltr">
                  {typeof a.value === "object" ? JSON.stringify(a.value) : String(a.value)}
                  {a.unit ? ` ${a.unit}` : ""}
                </code>
                <form action={setAssumptionAction} className="flex items-end gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="key" value={a.key} />
                  <TextInput name="value" placeholder={t("override")} />
                  <SubmitButton label={t("set")} />
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`${t("taxMatrices")} — ${t("year")} ${activeYear}`}>
        <p className="mb-2 text-xs text-neutral-500">{t("taxHint")}</p>
        <div className="mb-4 flex gap-2">
          {years.map((y) => (
            <a
              key={y}
              href={`/${locale}/registry?year=${y}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${y === activeYear ? "bg-blue-600 text-white" : "border border-neutral-300"}`}
            >
              {y}
            </a>
          ))}
        </div>
        <ul className="flex flex-col gap-4">
          {rules.map((r) => {
            const meta = (r.payload as { meta?: RuleMeta }).meta;
            return (
              <li key={r.ruleType} className="rounded-lg border border-neutral-100 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium">{r.ruleType}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${meta?.ownerReviewed ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
                  >
                    {meta?.ownerReviewed ? t("reviewed") : t("pendingReview")} · v{r.version}
                  </span>
                </div>
                <pre className="max-h-56 overflow-auto rounded bg-neutral-50 p-2 text-xs" dir="ltr">
                  {JSON.stringify(r.payload, null, 2)}
                </pre>
                {meta?.sources ? (
                  <p className="mt-1 text-xs text-neutral-400">
                    {t("sources")}:{" "}
                    {meta.sources.map((s, i) => (
                      <a key={i} href={s} className="underline" dir="ltr">
                        [{i + 1}]
                      </a>
                    ))}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
