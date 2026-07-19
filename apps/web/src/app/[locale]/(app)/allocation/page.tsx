import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { applyPresetAction, generatePlanAction } from "../../../../lib/actions/allocation-actions";
import { AllocationCart, type CartCandidate, type ImpactBase } from "../../../../components/allocation-cart";
import { Card } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";
import { Link } from "../../../../i18n/navigation";

interface Candidate {
  id: string; kind: string; editable: boolean; minAmount: number; maxAmount: number;
  suggestedAmount: number; ratePct: number | null; title?: string; titleHe?: string; detail: string; detailHe: string; goalImpact: string; goalImpactHe: string;
}
interface Variant {
  key: "GROWTH" | "DEBT_FREE" | "BALANCED";
  summary: { investedBase: number; debtRepaidBase: number; interestSavedYearBase: number; ceilingDepositsBase: number };
  pros: string[]; prosHe: string[]; cons: string[]; consHe: string[]; risks: string[]; risksHe: string[];
}
interface Plans {
  monthlyExpensesBase: number | null; bufferTargetBase: number | null;
  cashBase: number; freeCashBase: number; candidates: Candidate[]; variants: Variant[]; notes: string[];
}
type WP = Record<string, { enabled: boolean; amount: number }>;

export default async function AllocationPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  const { error } = await searchParams;
  const t = await getTranslations("allocation");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;
  const l = locale as Locale;
  const he = locale === "he";
  const nis = (n: number) => formatMoney(String(n), "ILS", l);

  if (household.workflowState !== "ALLOCATION") {
    return (
      <Card title={t("title")}>
        <p className="mb-4 text-sm text-neutral-600">{t("wrongPhase")}</p>
        <Link href="/verification" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">{t("goToGate")}</Link>
      </Card>
    );
  }

  const latest = await trpc.allocation.latest();
  const plan = (latest?.plan ?? null) as Plans | null;
  const isV3 = !!plan && Array.isArray(plan.candidates);
  const wp = (latest?.workingPlan ?? {}) as WP;
  const proposed = latest?.status === "PROPOSED";
  const base = isV3 && proposed ? ((await trpc.allocation.impactBase()) as ImpactBase | null) : null;

  const cartCandidates: CartCandidate[] = isV3
    ? plan!.candidates.map((c) => ({
        id: c.id, kind: c.kind, editable: c.editable, minAmount: c.minAmount, maxAmount: c.maxAmount,
        suggestedAmount: c.suggestedAmount, ratePct: c.ratePct,
        title: (he ? c.titleHe : c.title) || (c.ratePct !== null ? `${t(`kinds.${c.kind}`)} · ${c.ratePct}%` : t(`kinds.${c.kind}`)),
        detail: he ? c.detailHe : c.detail, goalImpact: he ? c.goalImpactHe : c.goalImpact,
      }))
    : [];
  const initial: Record<string, number> = {};
  for (const [id, sel] of Object.entries(wp)) {
    const c = isV3 ? plan!.candidates.find((x) => x.id === id) : undefined;
    if (sel.enabled && c && c.kind !== "TAX_VERIFY_PAYROLL") initial[id] = sel.amount;
  }

  const labels = {
    catalog: t("catalog"), myPlan: t("myPlan"), add: t("addToPlan"), remove: t("remove"), empty: t("cartEmpty"),
    allocated: t("allocated"), remaining: t("remaining"), over: t("overAllocated"), projected: t("projectedTotal"), inYears: t("inHorizon"),
    interestSaved: t("interestSavedShort"), liquidity: t("impLiquidity"), growthShare: t("growthVsTarget"), debtLeft: t("debtLeft"),
    approve: t("approveAndContinue"), approveHint: t("approveHint2"), note: t("approveNote"), verifyDone: t("verifyReminder"), perYear: t("perYearShort"), amountLabel: t("amountLabel"),
  };

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        <p className="mb-2 text-sm text-neutral-600">{t("introCart")}</p>
        <p className="mb-3 rounded-lg bg-blue-50/60 px-3 py-2 text-xs text-blue-800">{t("basisNote")}</p>
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{decodeURIComponent(error)}</p> : null}
        <form action={generatePlanAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">{latest ? t("regenerate") : t("generate")}</button>
        </form>
        {latest && !isV3 ? <p className="mt-3 text-sm text-amber-700">{t("legacyPlan")}</p> : null}
      </Card>

      {latest && isV3 && plan ? (
        <>
          <Card title={`${t("planTitle")} · ${new Date(latest.createdAt).toLocaleDateString(he ? "he-IL" : "en-GB")}`}>
            <div className="mb-3">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${latest.status === "APPROVED" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{t(`status.${latest.status}`)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label={t("cash")} value={nis(plan.cashBase)} />
              <Stat label={t("bufferTarget")} value={plan.bufferTargetBase !== null ? nis(plan.bufferTargetBase) : "—"} />
              <Stat label={t("freeCash")} value={nis(plan.freeCashBase)} highlight />
              <Stat label={t("monthlyExpenses")} value={plan.monthlyExpensesBase !== null ? nis(plan.monthlyExpensesBase) : "—"} />
            </div>
            {plan.notes.includes("EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED") ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("expensesUnknown")}</p> : null}
          </Card>

          {latest.status === "APPROVED" ? (
            <Card>
              <p className="mb-3 text-sm text-green-700">{t("approvedAligned")}</p>
              <Link href="/strategy" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">{t("toStrategy")} →</Link>
            </Card>
          ) : null}

          {proposed && plan.variants.length > 1 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {plan.variants.map((v) => (
                <div key={v.key} className={`flex flex-col rounded-xl border p-4 ${latest.chosenVariant === v.key ? "border-blue-500 ring-2 ring-blue-200" : "border-neutral-200"}`}>
                  <h3 className="mb-1 text-base font-semibold">{t(`variants.${v.key}.name`)}</h3>
                  <p className="mb-3 text-xs text-neutral-500">{t(`variants.${v.key}.tagline`)}</p>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                    <Stat label={t("sumInvested")} value={nis(v.summary.investedBase)} />
                    <Stat label={t("sumDebtRepaid")} value={nis(v.summary.debtRepaidBase)} />
                  </div>
                  <NList title={t("pros")} items={he ? v.prosHe : v.pros} tone="green" />
                  <NList title={t("risks")} items={he ? v.risksHe : v.risks} tone="red" />
                  <form action={applyPresetAction} className="mt-auto pt-3">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={latest.id} />
                    <input type="hidden" name="variant" value={v.key} />
                    <button type="submit" className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${latest.chosenVariant === v.key ? "bg-blue-600 text-white" : "border border-blue-300 text-blue-700 hover:bg-blue-50"}`}>{t("usePreset")}</button>
                  </form>
                </div>
              ))}
            </div>
          ) : null}

          {proposed && base ? (
            <Card title={t("workingTitle")}>
              <p className="mb-3 text-xs text-neutral-500">{t("cartHint")}</p>
              {plan.candidates.some((c) => !(he ? c.titleHe : c.title)) ? (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("rebuildForTitles")}</p>
              ) : null}
              <AllocationCart planId={latest.id} freeCash={plan.freeCashBase} candidates={cartCandidates} base={base} initial={initial} labels={labels} locale={locale} />
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div><div className="text-xs text-neutral-400">{label}</div><div className={`font-medium ${highlight ? "text-blue-700" : ""}`}>{value}</div></div>;
}
function NList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "red" }) {
  if (items.length === 0) return null;
  const c = tone === "green" ? "text-green-700" : "text-red-700";
  return <div className="mb-2"><div className={`mb-0.5 text-xs font-semibold ${c}`}>{title}</div><ul className="list-inside list-disc text-xs text-neutral-600">{items.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></div>;
}
