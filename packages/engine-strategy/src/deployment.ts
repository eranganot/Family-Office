import type { SnapshotPayload } from "@wealthos/domain";
import { deriveTargetGrowthPct } from "./analyzers/allocation";
import type { AnalyzerContext } from "./findings";
import { isCash, sum, valued } from "./analyzers/pools";
import { validateStrategyText } from "./validator";

/**
 * M27 — deployment engine v3 (ALLOCATION phase). Candidate-based: the engine emits
 * a menu of individual CANDIDATE actions the household can freely mix, each with an
 * editable amount (partial mortgage repayment = a smaller number), plus three named
 * PRESETS that seed the editable working plan, plus the three VARIANTS (with computed
 * pros/cons/risks) that back the comparison cards.
 *
 * Owner decisions 2026-07-19: full flexibility (cherry-pick across paths + edit
 * amounts); partial debt targets the highest-rate track first; each mortgage track
 * is its own candidate. EMPLOYED members get a payroll-verify candidate (satisfiable
 * by form 106 / payslip), SELF_EMPLOYED get deposit candidates. Buffer never guessed
 * (expenses unmapped ⇒ refuse). Strategy-level language only (validator-enforced).
 */

export type DeploymentStepKind =
  | "BUFFER_TOP_UP"
  | "REPAY_EXPENSIVE_DEBT"
  | "REPAY_DEBT"
  | "TAX_CEILING_HISHTALMUT"
  | "TAX_CEILING_PENSION"
  | "TAX_VERIFY_PAYROLL"
  | "INVEST_GROWTH"
  | "INVEST_DEFENSIVE";

export type DeploymentVariantKey = "GROWTH" | "DEBT_FREE" | "BALANCED";

/** An individually selectable, optionally-editable action. */
export interface DeploymentCandidate {
  id: string;
  kind: DeploymentStepKind;
  /** Short, human, one-line title for the card header (long "detail" is the explanation). */
  title: string;
  titleHe: string;
  editable: boolean;
  minAmount: number;
  maxAmount: number;
  suggestedAmount: number;
  ratePct: number | null;
  detail: string;
  detailHe: string;
  goalImpact: string;
  goalImpactHe: string;
  evidenceItemIds: string[];
}

export interface PresetEntry { candidateId: string; amount: number }

export interface DeploymentStep {
  id: string;
  kind: DeploymentStepKind;
  amountBase: number;
  detail: string;
  detailHe: string;
  goalImpact: string;
  goalImpactHe: string;
  evidenceItemIds: string[];
}

export interface VariantSummary {
  investedBase: number;
  debtRepaidBase: number;
  interestSavedYearBase: number;
  ceilingDepositsBase: number;
}

export interface DeploymentVariant {
  key: DeploymentVariantKey;
  steps: DeploymentStep[];
  leftoverBase: number;
  summary: VariantSummary;
  pros: string[]; prosHe: string[];
  cons: string[]; consHe: string[];
  risks: string[]; risksHe: string[];
}

export type DeploymentNote =
  | "EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED"
  | "BUFFER_BELOW_TARGET"
  | "MIX_UNKNOWN_INVEST_UNSPLIT"
  | "NO_FREE_CASH";

export interface DeploymentPlans {
  engineNote: "STRATEGY_LEVEL_ONLY_NEVER_PRODUCTS";
  monthlyExpensesBase: number | null;
  bufferTargetBase: number | null;
  cashBase: number;
  freeCashBase: number;
  /** The editable action menu the household mixes freely. */
  candidates: DeploymentCandidate[];
  /** Named seeds for the working plan: presets[key] = which candidates + amounts. */
  presets: Record<DeploymentVariantKey, PresetEntry[]>;
  /** Comparison cards with narratives (derived from the presets). */
  variants: DeploymentVariant[];
  notes: DeploymentNote[];
}

interface HishtalmutCeilings { selfEmployedExemptDepositAnnualILS: number }
interface PensionCeilings { qualifiedIncomeAnnualILS: number; maxBenefitDepositPctOfQualified: number }

const round = (n: number) => Math.round(n);
const nis = (n: number) => `₪${round(n).toLocaleString("en-US")}`;
const annualizeDeposit = (amount: number, frequency: string) => (frequency === "MONTHLY" ? amount * 12 : amount);

const TRACK_HE: Record<string, string> = {
  PRIME: "פריים", FIXED_LINKED: "קבועה צמודה", FIXED_UNLINKED: "קבועה לא צמודה",
  VARIABLE_LINKED: "משתנה צמודה", VARIABLE_UNLINKED: "משתנה לא צמודה", FOREIGN_CURRENCY: "מט\"ח",
};

export function computeDeploymentPlans(snapshot: SnapshotPayload, ctx: AnalyzerContext): DeploymentPlans {
  const notes: DeploymentNote[] = [];

  const monthlyExpenses = snapshot.items
    .filter((i) => i.cashFlow?.direction === "OUT" && i.cashFlow.amountBase !== null)
    .reduce((s, i) => {
      const a = i.cashFlow!.amountBase!;
      return s + (i.cashFlow!.frequency === "ANNUAL" ? a / 12 : i.cashFlow!.frequency === "MONTHLY" ? a : 0);
    }, 0);

  const cashItems = valued(snapshot.items).filter(isCash);
  const cashBase = sum(cashItems);
  const cashIds = cashItems.map((i) => i.id);
  const emptyPresets = { GROWTH: [], DEBT_FREE: [], BALANCED: [] } as Record<DeploymentVariantKey, PresetEntry[]>;
  const base = { engineNote: "STRATEGY_LEVEL_ONLY_NEVER_PRODUCTS" as const, cashBase: round(cashBase) };

  if (monthlyExpenses <= 0) {
    return { ...base, monthlyExpensesBase: null, bufferTargetBase: null, freeCashBase: 0, candidates: [], presets: emptyPresets, variants: [], notes: ["EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED"] };
  }

  const targetMonths = Number(ctx.assumptions["emergency_fund_months"] ?? 6);
  const bufferTarget = monthlyExpenses * targetMonths;

  if (cashBase < bufferTarget) {
    const shortfall = round(bufferTarget - cashBase);
    const c: DeploymentCandidate = {
      id: "buffer", kind: "BUFFER_TOP_UP", title: "Top up the emergency buffer", titleHe: "השלמת כרית החירום",
      editable: false, minAmount: shortfall, maxAmount: shortfall, suggestedAmount: shortfall, ratePct: null,
      detail: `Cash covers less than the ${targetMonths}-month buffer — direct new savings to close the ${nis(shortfall)} shortfall before deploying anything.`,
      detailHe: `המזומן מכסה פחות מכרית של ${targetMonths} חודשים — נתבו חיסכון חדש לסגירת פער של ${nis(shortfall)} לפני כל פריסה אחרת.`,
      goalImpact: "Protects every goal: the buffer keeps a shock from forcing goal-asset sales.",
      goalImpactHe: "מגן על כל היעדים: הכרית מונעת ממשבר לאלץ מכירת נכסי יעדים.",
      evidenceItemIds: cashIds,
    };
    notes.push("BUFFER_BELOW_TARGET");
    const preset = [{ candidateId: "buffer", amount: shortfall }];
    const presets = { GROWTH: preset, DEBT_FREE: preset, BALANCED: preset };
    const variant: DeploymentVariant = { key: "BALANCED", steps: [{ id: "buffer", kind: "BUFFER_TOP_UP", amountBase: shortfall, detail: c.detail, detailHe: c.detailHe, goalImpact: c.goalImpact, goalImpactHe: c.goalImpactHe, evidenceItemIds: cashIds }], leftoverBase: 0, summary: { investedBase: 0, debtRepaidBase: 0, interestSavedYearBase: 0, ceilingDepositsBase: 0 }, pros: [], prosHe: [], cons: [], consHe: [], risks: [], risksHe: [] };
    return { ...base, monthlyExpensesBase: round(monthlyExpenses), bufferTargetBase: round(bufferTarget), freeCashBase: 0, candidates: [c], presets, variants: [variant], notes };
  }

  const freeCash = cashBase - bufferTarget;
  if (freeCash <= 0) notes.push("NO_FREE_CASH");

  const expensiveRate = Number(ctx.assumptions["expensive_debt_rate_pct"] ?? 8);
  const expectedReturn = Number(ctx.assumptions["expected_real_return_equity_pct"] ?? 4.5);
  const volatility = Number(ctx.assumptions["mc_return_volatility_pct"] ?? 15);
  const targetGrowthPct = deriveTargetGrowthPct(ctx.assumptions);
  const unknownMaxPct = Number(ctx.assumptions["allocation_mix_unknown_max_pct"] ?? 50);

  // ---- candidate menu --------------------------------------------------------
  const candidates: DeploymentCandidate[] = [];

  // debt: one candidate per mortgage track, highest rate first
  const tracks: Array<{ itemId: string; itemName: string; trackType: string; name: string; ratePct: number; principal: number; idx: number }> = [];
  for (const it of snapshot.items) {
    if (it.kind === "MORTGAGE" && it.mortgageTracks) {
      it.mortgageTracks.forEach((t, idx) => {
        if (t.principalRemaining > 0) tracks.push({ itemId: it.id, itemName: it.name, trackType: t.trackType, name: `${it.name} · ${t.trackType}`, ratePct: t.annualRatePct, principal: t.principalRemaining, idx });
      });
    }
  }
  tracks.sort((a, b) => b.ratePct - a.ratePct);
  for (const t of tracks) {
    const expensive = t.ratePct > expensiveRate;
    const suggested = round(Math.min(freeCash, t.principal));
    candidates.push({
      id: `debt:${t.itemId}:${t.idx}`, kind: expensive ? "REPAY_EXPENSIVE_DEBT" : "REPAY_DEBT",
      title: `Repay mortgage · ${t.itemName} · ${t.trackType} · ${t.ratePct}%`,
      titleHe: `פירעון משכנתא · ${t.itemName} · ${TRACK_HE[t.trackType] ?? t.trackType} · ${t.ratePct}%`,
      editable: true, minAmount: 0, maxAmount: round(t.principal), suggestedAmount: suggested, ratePct: t.ratePct,
      detail: `Repay part or all of "${t.name}" (${t.ratePct}%, ${nis(t.principal)} outstanding) — a guaranteed ${t.ratePct}% return${expensive ? ", above the expected investment return" : ` vs ~${expectedReturn}% (real) expected from investing`}. Get the early-repayment fee quote first.`,
      detailHe: `פרעו חלק או הכול מ"${t.name}" (${t.ratePct}%, יתרה ${nis(t.principal)}) — תשואה מובטחת של ${t.ratePct}%${expensive ? ", מעל התשואה הצפויה מהשקעה" : ` לעומת ~${expectedReturn}% ריאלי צפוי מהשקעה`}. בקשו קודם דוח עמלת פירעון מוקדם.`,
      goalImpact: "Lowers future obligations and monthly pressure — indirect support for every goal.",
      goalImpactHe: "מקטין התחייבויות עתידיות ולחץ חודשי — תמיכה עקיפה בכל היעדים.",
      evidenceItemIds: [t.itemId],
    });
  }

  // tax: deposit (self-employed) or payroll-verify (employed / unknown)
  const hish = ctx.taxRules["HISHTALMUT_CEILINGS"] as HishtalmutCeilings | undefined;
  const pens = ctx.taxRules["PENSION_CEILINGS"] as PensionCeilings | undefined;
  const hishCeiling = hish?.selfEmployedExemptDepositAnnualILS ?? 0;
  const pensCeiling = pens ? (pens.qualifiedIncomeAnnualILS * pens.maxBenefitDepositPctOfQualified) / 100 : 0;
  const depositsFor = (memberId: string, flowType: string) => {
    let total = 0;
    for (const it of snapshot.items) {
      const cf = it.cashFlow;
      if (it.kind === "CASH_FLOW" && cf && cf.flowType === flowType && cf.amountBase !== null && it.ownerMemberIds.includes(memberId)) total += annualizeDeposit(cf.amountBase, cf.frequency);
    }
    return total;
  };
  if (snapshot.baseCurrency === "ILS") {
    for (const adult of snapshot.members.filter((m) => m.role === "ADULT")) {
      if (adult.employmentStatus === "SELF_EMPLOYED") {
        const hu = hishCeiling - depositsFor(adult.id, "HISHTALMUT_CONTRIBUTION");
        if (hishCeiling > 0 && hu > 0) candidates.push({
          id: `hish:${adult.id}`, kind: "TAX_CEILING_HISHTALMUT",
          title: `Deposit · keren hishtalmut · ${adult.name}`, titleHe: `הפקדה · קרן השתלמות · ${adult.name}`,
          editable: true, minAmount: 0, maxAmount: round(hu), suggestedAmount: round(hu), ratePct: null,
          detail: `Deposit up to ${nis(hu)} to ${adult.name}'s keren hishtalmut — inside this year's exempt ceiling, growth is capital-gains free.`,
          detailHe: `הפקידו עד ${nis(hu)} לקרן ההשתלמות של ${adult.name} — בתוך התקרה הפטורה השנה, הצבירה פטורה ממס רווחי הון.`,
          goalImpact: "Tax-free compounding accelerates every long-term goal.", goalImpactHe: "צבירה פטורה ממס מאיצה כל יעד ארוך-טווח.", evidenceItemIds: [],
        });
        const pu = pensCeiling - depositsFor(adult.id, "PENSION_CONTRIBUTION");
        if (pensCeiling > 0 && pu > 0) candidates.push({
          id: `pens:${adult.id}`, kind: "TAX_CEILING_PENSION",
          title: `Deposit · pension · ${adult.name}`, titleHe: `הפקדה · פנסיה · ${adult.name}`,
          editable: true, minAmount: 0, maxAmount: round(pu), suggestedAmount: round(pu), ratePct: null,
          detail: `Deposit up to ${nis(pu)} to ${adult.name}'s pension within the benefit ceiling — immediate deduction/credit value.`,
          detailHe: `הפקידו עד ${nis(pu)} לפנסיה של ${adult.name} בתוך תקרת ההטבה — שווי ניכוי/זיכוי מיידי.`,
          goalImpact: "Strengthens the retirement goal, with an immediate tax benefit.", goalImpactHe: "מחזק את יעד הפרישה, עם הטבת מס מיידית.", evidenceItemIds: [],
        });
      } else {
        candidates.push({
          id: `verify:${adult.id}`, kind: "TAX_VERIFY_PAYROLL",
          title: `Verify payroll · ${adult.name}`, titleHe: `בדיקת תלוש · ${adult.name}`,
          editable: false, minAmount: 0, maxAmount: 0, suggestedAmount: 0, ratePct: null,
          detail: `${adult.name}: contributions run through the employer — confirm from form 106 (or one payslip) that pension + hishtalmut deductions capture the ceilings (a section-46 supplemental deposit may apply if not).`,
          detailHe: `${adult.name}: ההפקדות רצות דרך המעסיק — אשרו מטופס 106 (או מתלוש אחד) שניכויי הפנסיה וההשתלמות ממצים את התקרות (אם לא — ייתכן שרלוונטית הפקדה משלימה לפי סעיף 46).`,
          goalImpact: "Confirms the tax benefits behind the retirement goal are fully captured.", goalImpactHe: "מוודא שהטבות המס שמאחורי יעד הפרישה ממוצות במלואן.", evidenceItemIds: [],
        });
      }
    }
  }

  // invest: growth + defensive (editable up to free cash)
  const investable = valued(snapshot.items).filter((i) => i.kind === "ACCOUNT");
  let growth = 0, known = 0, unknown = 0;
  for (const i of investable) {
    const v = i.valueBase ?? 0;
    if (i.growthSharePct !== null && i.growthSharePct !== undefined) { growth += (v * i.growthSharePct) / 100; known += v; }
    else if (isCash(i)) known += v; else unknown += v;
  }
  const unknownSharePct = known + unknown > 0 ? (unknown / (known + unknown)) * 100 : 0;
  const mixUnknown = unknownSharePct > unknownMaxPct;
  if (mixUnknown) notes.push("MIX_UNKNOWN_INVEST_UNSPLIT");
  const goalNames = snapshot.goals.filter((g) => g.requiredFundingBase !== null).sort((a, b) => a.priority - b.priority).slice(0, 2).map((g) => g.name);
  const goalsLabel = goalNames.length > 0 ? goalNames.join(", ") : null;
  const investGI = (amt: number) => ({
    goalImpact: goalsLabel ? `Advances ${goalsLabel}: closes ~${nis(amt)} of today's total goal funding gap.` : `Closes ~${nis(amt)} of today's total goal funding gap.`,
    goalImpactHe: goalsLabel ? `מקדם את ${goalsLabel}: סוגר כ-${nis(amt)} מפער המימון הכולל של היעדים כיום.` : `סוגר כ-${nis(amt)} מפער המימון הכולל של היעדים כיום.`,
  });
  candidates.push({
    id: "invest:growth", kind: "INVEST_GROWTH",
    title: `Invest · growth channels (target ${targetGrowthPct}%)`, titleHe: `השקעה · אפיקי צמיחה (יעד ${targetGrowthPct}%)`,
    editable: true, minAmount: 0, maxAmount: round(freeCash), suggestedAmount: 0, ratePct: null,
    detail: `Invest in growth channels (equity-type tracks in existing wrappers or a taxable investment account) — moves the mix toward your ${targetGrowthPct}% target.${mixUnknown ? " Record your accounts' growth share first for a responsible split." : ""}`,
    detailHe: `השקיעו באפיקי צמיחה (מסלולים מוטי-צמיחה בעטיפות הקיימות או חשבון השקעות חייב) — מקרב את התמהיל ליעד ${targetGrowthPct}%.${mixUnknown ? " הזינו קודם רכיב צמיחה לחשבונות לפיצול אחראי." : ""}`,
    ...investGI(freeCash), evidenceItemIds: [],
  });
  candidates.push({
    id: "invest:defensive", kind: "INVEST_DEFENSIVE",
    title: "Invest · defensive channels", titleHe: "השקעה · אפיקים סולידיים",
    editable: true, minAmount: 0, maxAmount: round(freeCash), suggestedAmount: 0, ratePct: null,
    detail: `Place in defensive channels (bond-oriented tracks / deposits) to keep the mix at target.`,
    detailHe: `הניחו באפיקים סולידיים (מסלולים מוטי-אג"ח / פיקדונות) לשמירת התמהיל ביעד.`,
    ...investGI(freeCash), evidenceItemIds: [],
  });

  // ---- policy → preset entries (cascade over free cash) ----------------------
  const candById = new Map(candidates.map((c) => [c.id, c]));
  const buildPreset = (policy: DeploymentVariantKey): PresetEntry[] => {
    let remaining = freeCash;
    const entries: PresetEntry[] = [];
    const take = (id: string, want: number) => {
      const c = candById.get(id); if (!c) return;
      const amt = Math.min(want, remaining, c.maxAmount || want);
      if (amt > 0.5 || (!c.editable && c.kind === "TAX_VERIFY_PAYROLL")) {
        entries.push({ candidateId: id, amount: c.kind === "TAX_VERIFY_PAYROLL" ? 0 : round(amt) });
        if (c.kind !== "TAX_VERIFY_PAYROLL") remaining -= amt;
      }
    };
    // verifies always included (0-amount reminders)
    for (const c of candidates) if (c.kind === "TAX_VERIFY_PAYROLL") take(c.id, 0);
    // tax deposits (self-employed) first
    for (const c of candidates) if (c.kind === "TAX_CEILING_HISHTALMUT" || c.kind === "TAX_CEILING_PENSION") take(c.id, c.maxAmount);
    // debt per policy
    const debtIds = candidates.filter((c) => c.kind === "REPAY_EXPENSIVE_DEBT" || c.kind === "REPAY_DEBT")
      .filter((c) => policy === "GROWTH" ? false : policy === "BALANCED" ? c.kind === "REPAY_EXPENSIVE_DEBT" : true)
      .map((c) => c.id);
    for (const id of debtIds) take(id, candById.get(id)!.maxAmount);
    // invest the remainder split by target
    if (remaining > 0.5) {
      if (mixUnknown) { entries.push({ candidateId: "invest:growth", amount: round(remaining) }); remaining = 0; }
      else {
        const totalAfter = known + remaining;
        const desiredGrowth = (targetGrowthPct / 100) * totalAfter;
        const g = Math.min(remaining, Math.max(0, desiredGrowth - growth));
        const d = remaining - g;
        if (g > 0.5) entries.push({ candidateId: "invest:growth", amount: round(g) });
        if (d > 0.5) entries.push({ candidateId: "invest:defensive", amount: round(d) });
      }
    }
    return entries;
  };
  const presets = { GROWTH: buildPreset("GROWTH"), DEBT_FREE: buildPreset("DEBT_FREE"), BALANCED: buildPreset("BALANCED") };

  // ---- variants (comparison cards) derived from presets ----------------------
  const toVariant = (key: DeploymentVariantKey): DeploymentVariant => {
    const entries = presets[key];
    let n = 0;
    const steps: DeploymentStep[] = entries.map((e) => {
      const c = candById.get(e.candidateId)!;
      return { id: `${key.toLowerCase()}-s${++n}`, kind: c.kind, amountBase: e.amount, detail: c.detail, detailHe: c.detailHe, goalImpact: c.goalImpact, goalImpactHe: c.goalImpactHe, evidenceItemIds: c.evidenceItemIds };
    });
    const summary: VariantSummary = { investedBase: 0, debtRepaidBase: 0, interestSavedYearBase: 0, ceilingDepositsBase: 0 };
    for (const e of entries) {
      const c = candById.get(e.candidateId)!;
      if (c.kind === "INVEST_GROWTH" || c.kind === "INVEST_DEFENSIVE") summary.investedBase += e.amount;
      else if (c.kind === "REPAY_EXPENSIVE_DEBT" || c.kind === "REPAY_DEBT") { summary.debtRepaidBase += e.amount; summary.interestSavedYearBase += round((e.amount * (c.ratePct ?? 0)) / 100); }
      else if (c.kind === "TAX_CEILING_HISHTALMUT" || c.kind === "TAX_CEILING_PENSION") summary.ceilingDepositsBase += e.amount;
    }
    const allocated = entries.reduce((t, e) => t + e.amount, 0);
    return { key, steps, leftoverBase: round(Math.max(0, freeCash - allocated)), summary, ...buildNarrative(key, summary, expectedReturn, volatility, candidates.some((c) => c.kind === "REPAY_EXPENSIVE_DEBT")) };
  };
  const variants = [toVariant("BALANCED"), toVariant("GROWTH"), toVariant("DEBT_FREE")];

  const texts = [
    ...candidates.flatMap((c) => [c.detail, c.detailHe, c.goalImpact, c.goalImpactHe]),
    ...variants.flatMap((v) => [...v.pros, ...v.prosHe, ...v.cons, ...v.consHe, ...v.risks, ...v.risksHe]),
  ];
  const validation = validateStrategyText(texts);
  if (!validation.valid) throw new Error(`PRODUCT_REFERENCE_IN_DEPLOYMENT:${validation.pattern}`);

  return { ...base, monthlyExpensesBase: round(monthlyExpenses), bufferTargetBase: round(bufferTarget), freeCashBase: round(freeCash), candidates, presets, variants, notes };
}

function buildNarrative(key: DeploymentVariantKey, s: VariantSummary, expectedReturn: number, volatility: number, hasExpensiveDebt: boolean): Pick<DeploymentVariant, "pros" | "prosHe" | "cons" | "consHe" | "risks" | "risksHe"> {
  if (key === "GROWTH") return {
    pros: [`Highest expected long-run value: ${s.investedBase > 0 ? `${nis(s.investedBase)} invested` : "everything invested"} at ~${expectedReturn}% expected real return.`, "Full liquidity retained — invested money stays reachable; nothing is locked into the house."],
    prosHe: [`תוחלת הערך הגבוהה ביותר לטווח ארוך: ${s.investedBase > 0 ? `${nis(s.investedBase)} מושקעים` : "הכול מושקע"} בתשואה ריאלית צפויה של ~${expectedReturn}%.`, "נזילות מלאה נשמרת — הכסף המושקע נשאר נגיש; דבר אינו ננעל בבית."],
    cons: [`The mortgage stays fully in place — payments and interest continue${hasExpensiveDebt ? ", INCLUDING tracks above the expensive-debt line" : ""}.`, "Expected return is an average, not a promise; the debt's interest is certain."],
    consHe: [`המשכנתא נשארת במלואה — ההחזרים והריבית ממשיכים${hasExpensiveDebt ? ", כולל מסלולים מעל קו החוב היקר" : ""}.`, "התשואה הצפויה היא ממוצע, לא הבטחה; ריבית החוב ודאית."],
    risks: [`Market risk: ~${volatility}% annual volatility means multi-year drawdowns are normal; money needed within ~5 years should not ride this path.`, "Behavioral risk: a crash + a full mortgage is when households capitulate — answer the drawdown question honestly."],
    risksHe: [`סיכון שוק: תנודתיות שנתית של ~${volatility}% פירושה שירידות רב-שנתיות הן נורמליות; כסף שנדרש בתוך ~5 שנים לא צריך לרכוב על המסלול הזה.`, "סיכון התנהגותי: מפולת + משכנתא מלאה הם הרגע שבו משקי בית נשברים — ענו בכנות על שאלת הירידות."],
  };
  if (key === "DEBT_FREE") return {
    pros: [`A guaranteed, tax-free "return": ${nis(s.interestSavedYearBase)} interest avoided every year on ${nis(s.debtRepaidBase)} repaid — no market can promise that.`, "Lower future obligations and real psychological relief; resilience to income shocks rises immediately."],
    prosHe: [`"תשואה" מובטחת ופטורה ממס: ${nis(s.interestSavedYearBase)} ריבית שנחסכת מדי שנה על ${nis(s.debtRepaidBase)} שנפרעו — שום שוק לא מבטיח את זה.`, "התחייבויות עתידיות נמוכות יותר והקלה פסיכולוגית אמיתית; העמידות לזעזועי הכנסה עולה מיד."],
    cons: [`Expected opportunity cost: cheap tracks repaid at ~2-4% while investing targets ~${expectedReturn}% real — over decades the gap compounds.`, "Money sunk into the house is the least liquid form of wealth; getting it back means borrowing again or selling.", "Early-repayment fees (עמלת פירעון מוקדם) can eat part of the benefit — always get the quote first."],
    consHe: [`עלות הזדמנות צפויה: מסלולים זולים נפרעים ב~2-4% בעוד ההשקעה מכוונת ל~${expectedReturn}% ריאלי — לאורך עשורים הפער מצטבר.`, "כסף ששוקע בבית הוא צורת ההון הכי פחות נזילה; להחזיר אותו פירושו ללוות שוב או למכור.", "עמלות פירעון מוקדם עלולות לאכול חלק מהתועלת — תמיד בקשו את הדוח קודם."],
    risks: ["Inflation risk reversal: unlinked cheap debt is an inflation HEDGE — repaying it gives that up; CPI-linked tracks are the better repayment targets.", "Concentration: the household becomes even more real-estate-heavy after repayment."],
    risksHe: ["היפוך סיכון אינפלציה: חוב זול לא-צמוד הוא הגנה מפני אינפלציה — פירעונו מוותר עליה; מסלולים צמודי-מדד הם יעדי הפירעון העדיפים.", "ריכוזיות: משק הבית נעשה עוד יותר מוטה-נדל\"ן אחרי הפירעון."],
  };
  return {
    pros: ["Math-driven middle path: only debt priced above the expected investment return is repaid; free tax money is captured; the rest compounds at the target mix.", "Every threshold is a registry assumption you control — the plan changes when your answers change."],
    prosHe: ["דרך אמצע מונחית-חישוב: נפרע רק חוב שמתומחר מעל התשואה הצפויה מהשקעה; כסף מס חינם נתפס; והיתרה צוברת בתמהיל היעד.", "כל סף הוא הנחת רגיסטרי בשליטתכם — התוכנית משתנה כשהתשובות שלכם משתנות."],
    cons: ["Neither pure story: some debt remains AND some market risk is taken — households wanting one clean philosophy may prefer the other paths."],
    consHe: ["אף סיפור טהור: נשאר קצת חוב וגם נלקח קצת סיכון שוק — מי שרוצה פילוסופיה נקייה אחת עשוי להעדיף את המסלולים האחרים."],
    risks: [`Standard market risk on the invested portion (~${volatility}% annual volatility); guaranteed-return logic applies only to the repaid tracks.`],
    risksHe: [`סיכון שוק רגיל על החלק המושקע (תנודתיות שנתית ~${volatility}%); היגיון התשואה המובטחת חל רק על המסלולים שנפרעו.`],
  };
}
