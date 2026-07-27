import { formatMoney, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { Card, ErrorBanner, Explainer, Field, Select, SubmitButton, SuccessBanner, TextInput } from "../../../../components/fields";
import {
  bulkClassifyMerchantAction,
  classifyTransactionAction,
  closePeriodAction,
  createManualTransactionAction,
  recomputePeriodAction,
  reopenPeriodAction,
  upsertCategoryAction,
} from "../../../../lib/actions/operations-actions";
import { BehavioralBars, CategoryTable, SurplusWaterfall } from "../../../../components/operations/dual-axis";
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

/** Indented label so the tree is readable inside a flat <select>. */
function optionLabel(c: FlatCategory, locale: string): string {
  const depth = c.key.split(".").length - 1;
  return `${"  ".repeat(depth)}${locale === "he" ? c.nameHe : c.nameEn}`;
}

export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string; created?: string; classified?: string; categorySaved?: string;
    recomputed?: string; closed?: string; reopened?: string; tab?: string;
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
  const period = await trpc.operations.period.current();
  const suspense = await trpc.operations.suspense.queue({ limit: 25 });
  const { year, month, row: periodRow, computed } = period;
  const flow = computed.flow;
  const surplus = computed.surplus;
  const sts = computed.safeToSpend;
  const baseCurrency = "ILS";

  const flat = cats.flat as unknown as FlatCategory[];
  const income = flat.filter((c) => c.axis === "INCOME");
  const expense = flat.filter((c) => c.axis === "EXPENSE");
  const byId = new Map(flat.map((c) => [c.id, c]));
  const today = new Date().toISOString().slice(0, 10);
  const loc = locale as Locale;

  const errorMsg = sp.error ? tf("error") : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Explainer title={t("explainer.title")} paragraphs={[t("explainer.p1"), t("explainer.p2")]} />

      <ErrorBanner message={errorMsg} />
      <SuccessBanner
        message={
          sp.created ? t("created")
          : sp.classified ? t("classified")
          : sp.categorySaved ? t("categorySaved")
          : sp.recomputed ? t("recomputed")
          : sp.closed ? t("closedOk")
          : sp.reopened ? t("reopenedOk")
          : undefined
        }
      />

      {/* ---------------------------------------------------------- M37 --- */}
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

      <Card title={t("suspenseTitle")}>
        <p className="mb-4 text-xs text-neutral-500">{t("suspenseHint", { threshold: Math.round(suspense.minConfidence * 100) })}</p>
        {suspense.rows.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("suspenseEmpty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                <th className="py-2 text-start">{t("date")}</th>
                <th className="py-2 text-start">{t("description")}</th>
                <th className="py-2 text-start">{t("guessed")}</th>
                <th className="py-2 text-start">{t("confidence")}</th>
                <th className="py-2 text-start">{t("confirmForMerchant")}</th>
              </tr>
            </thead>
            <tbody>
              {suspense.rows.map((tx) => (
                <tr key={tx.id} className="border-b border-neutral-100">
                  <td className="py-2 whitespace-nowrap">{new Date(tx.bookedAt).toISOString().slice(0, 10)}</td>
                  <td className="py-2">{tx.descriptionRedacted}</td>
                  <td className="py-2 text-xs">{tx.category ? (locale === "he" ? tx.category.nameHe : tx.category.nameEn) : "—"}</td>
                  <td className="py-2 text-xs tabular-nums">
                    {Math.round(Number(tx.classifications[0]?.confidence ?? 0) * 100)}%
                  </td>
                  <td className="py-2">
                    <form action={bulkClassifyMerchantAction} className="flex items-center gap-1">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="merchantKey" value={tx.merchantKey ?? ""} />
                      <Select name="categoryId" defaultValue={tx.categoryId ?? ""} required>
                        <option value="" disabled>{t("choose")}</option>
                        {flat.map((c) => <option key={c.id} value={c.id}>{optionLabel(c, locale)}</option>)}
                      </Select>
                      <Select name="behavioralClass" defaultValue={tx.behavioralClass ?? "VARIABLE_DISCRETIONARY"}>
                        {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
                      </Select>
                      <button type="submit" className="whitespace-nowrap text-xs text-blue-600 underline" disabled={!tx.merchantKey}>
                        {t("applyToMerchant")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <Select name="categoryId" defaultValue="">
              <option value="">{t("uncategorised")}</option>
              <optgroup label={t("axis.EXPENSE")}>
                {expense.map((c) => <option key={c.id} value={c.id}>{optionLabel(c, locale)}</option>)}
              </optgroup>
              <optgroup label={t("axis.INCOME")}>
                {income.map((c) => <option key={c.id} value={c.id}>{optionLabel(c, locale)}</option>)}
              </optgroup>
            </Select>
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
        {txns.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("noTransactions")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-start text-xs text-neutral-500">
                <th className="py-2 text-start">{t("date")}</th>
                <th className="py-2 text-start">{t("description")}</th>
                <th className="py-2 text-start">{t("amount")}</th>
                <th className="py-2 text-start">{t("category")}</th>
                <th className="py-2 text-start">{t("behavioral")}</th>
                <th className="py-2 text-start">{t("reclassify")}</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((tx) => {
                const cat = tx.categoryId ? byId.get(tx.categoryId) : undefined;
                const amount = Number(tx.amount);
                return (
                  <tr key={tx.id} className="border-b border-neutral-100">
                    <td className="py-2 whitespace-nowrap">{new Date(tx.bookedAt).toISOString().slice(0, 10)}</td>
                    <td className="py-2">
                      {tx.descriptionRedacted}
                      {tx.instalmentTotal ? (
                        <span className="ms-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                          {t("instalmentBadge", { n: tx.instalmentNumber ?? 1, total: tx.instalmentTotal })}
                        </span>
                      ) : null}
                      {tx.isRecurringCandidate ? (
                        <span className="ms-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{t("recurringBadge")}</span>
                      ) : null}
                    </td>
                    <td className={`py-2 whitespace-nowrap ${amount < 0 ? "text-neutral-800" : "text-green-700"}`}>
                      {formatMoney(Math.abs(amount), tx.currency, loc)}
                    </td>
                    <td className="py-2">
                      {cat ? (locale === "he" ? cat.nameHe : cat.nameEn) : (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{t("unclassifiedBadge")}</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-neutral-500">
                      {tx.behavioralClass ? t(`behavioralClass.${tx.behavioralClass}`) : "—"}
                    </td>
                    <td className="py-2">
                      <form action={classifyTransactionAction} className="flex items-center gap-1">
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="transactionId" value={tx.id} />
                        <Select name="categoryId" defaultValue={tx.categoryId ?? ""} required>
                          <option value="" disabled>{t("choose")}</option>
                          {flat.map((c) => <option key={c.id} value={c.id}>{optionLabel(c, locale)}</option>)}
                        </Select>
                        <Select name="behavioralClass" defaultValue={tx.behavioralClass ?? cat?.defaultBehavioralClass ?? "VARIABLE_DISCRETIONARY"}>
                          {BEHAVIORAL.map((b) => <option key={b} value={b}>{t(`behavioralClass.${b}`)}</option>)}
                        </Select>
                        <button type="submit" className="text-xs text-blue-600 underline">{t("apply")}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

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
            <Select name="parentId" defaultValue="">
              <option value="">{t("noParent")}</option>
              {flat.map((c) => <option key={c.id} value={c.id}>{optionLabel(c, locale)}</option>)}
            </Select>
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
