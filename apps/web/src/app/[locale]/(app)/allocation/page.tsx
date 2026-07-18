import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { approvePlanAction, generatePlanAction } from "../../../../lib/actions/allocation-actions";
import { Card, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { Link } from "../../../../i18n/navigation";

/** M25 — the ALLOCATION phase page: where every free shekel gets an ordered destination. */

interface PlanShape {
  monthlyExpensesBase: number | null;
  bufferTargetBase: number | null;
  cashBase: number;
  freeCashBase: number;
  steps: Array<{ kind: string; amountBase: number; detail: string; detailHe: string }>;
  leftoverBase: number;
  notes: string[];
}

export default async function AllocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("allocation");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;
  const l = locale as Locale;
  const nis = (n: number) => formatMoney(String(n), "ILS", l);

  if (household.workflowState !== "ALLOCATION") {
    return (
      <Card title={t("title")}>
        <p className="mb-4 text-sm text-neutral-600">{t("wrongPhase")}</p>
        <Link href="/verification" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          {t("goToGate")}
        </Link>
      </Card>
    );
  }

  const latest = await trpc.allocation.latest();
  const plan = (latest?.plan ?? null) as PlanShape | null;

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        <p className="mb-3 text-sm text-neutral-600">{t("intro")}</p>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{decodeURIComponent(error)}</p> : null}
        <form action={generatePlanAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            {latest ? t("regenerate") : t("generate")}
          </button>
        </form>
      </Card>

      {latest && plan ? (
        <Card title={`${t("planTitle")} · ${new Date(latest.createdAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB")}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${latest.status === "APPROVED" ? "bg-green-50 text-green-700" : latest.status === "PROPOSED" ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>
              {t(`status.${latest.status}`)}
            </span>
            {latest.note === "AUTO_APPROVED_NOTHING_TO_DEPLOY" ? (
              <span className="text-neutral-400">{t("autoApproved")}</span>
            ) : null}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label={t("cash")} value={nis(plan.cashBase)} />
            <Stat label={t("bufferTarget")} value={plan.bufferTargetBase !== null ? nis(plan.bufferTargetBase) : "—"} />
            <Stat label={t("freeCash")} value={nis(plan.freeCashBase)} highlight={plan.freeCashBase > 0} />
            <Stat label={t("monthlyExpenses")} value={plan.monthlyExpensesBase !== null ? nis(plan.monthlyExpensesBase) : "—"} />
          </div>

          {plan.notes.includes("EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED") ? (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("expensesUnknown")}</p>
          ) : null}

          {plan.steps.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {plan.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-100 p-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
                  <div>
                    <div className="mb-0.5 flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">{t(`kinds.${s.kind}`)}</span>
                      <span className="font-semibold">{nis(s.amountBase)}</span>
                    </div>
                    <p className="text-sm text-neutral-700" dir="auto">{locale === "he" ? s.detailHe : s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-neutral-500">{t("noSteps")}</p>
          )}

          {latest.status === "PROPOSED" ? (
            <form action={approvePlanAction} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="id" value={latest.id} />
              <TextInput name="note" placeholder={t("approveNote")} />
              <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white">
                {t("approve")}
              </button>
            </form>
          ) : null}
          {latest.status === "APPROVED" ? (
            <p className="mt-4 text-sm text-green-700">{t("approvedNext")}</p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className={`font-medium ${highlight ? "text-blue-700" : ""}`}>{value}</div>
    </div>
  );
}
