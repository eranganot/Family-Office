import type { SnapshotPayload } from "@wealthos/domain";
import { deriveTargetGrowthPct } from "./analyzers/allocation";
import type { AnalyzerContext } from "./findings";
import { isCash, sum, valued } from "./analyzers/pools";
import { validateStrategyText } from "./validator";

/**
 * M26 — free-cash deployment engine v2 (ALLOCATION phase).
 * Owner decisions 2026-07-19:
 *  - THREE computed variants per plan (GROWTH / DEBT_FREE / BALANCED), each with
 *    bilingual pros/cons/risks so the household chooses a philosophy, not a number.
 *  - Employment-aware tax steps: EMPLOYED members get a payroll-verification step
 *    (their ceilings flow through salary); lump-sum deposit steps are for
 *    SELF_EMPLOYED members only. Unknown employment ⇒ verify, never deposit.
 *  - Per-step ids for individual approve/decline (gate = every step decided).
 *  - Goal impact per step: qualitative + quantified for invest steps (invested
 *    money reduces today's PV goal gap ~1:1; deeper simulation is backlogged).
 * Unchanged principles: buffer first; expenses unmapped ⇒ REFUSE (never guess);
 * strategy-level language only (validator-enforced); pure and deterministic.
 */

export type DeploymentVariantKey = "GROWTH" | "DEBT_FREE" | "BALANCED";

export type DeploymentStepKind =
  | "BUFFER_TOP_UP"
  | "REPAY_EXPENSIVE_DEBT"
  | "REPAY_DEBT"
  | "TAX_CEILING_HISHTALMUT"
  | "TAX_CEILING_PENSION"
  | "TAX_VERIFY_PAYROLL"
  | "INVEST_GROWTH"
  | "INVEST_DEFENSIVE";

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
  /** Annual interest avoided by the repayment steps (principal × rate). */
  interestSavedYearBase: number;
  ceilingDepositsBase: number;
}

export interface DeploymentVariant {
  key: DeploymentVariantKey;
  steps: DeploymentStep[];
  leftoverBase: number;
  summary: VariantSummary;
  pros: string[];
  prosHe: string[];
  cons: string[];
  consHe: string[];
  risks: string[];
  risksHe: string[];
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
  variants: DeploymentVariant[];
  notes: DeploymentNote[];
}

interface HishtalmutCeilings { selfEmployedExemptDepositAnnualILS: number }
interface PensionCeilings { qualifiedIncomeAnnualILS: number; maxBenefitDepositPctOfQualified: number }
interface Debt { itemId: string; name: string; ratePct: number; principal: number }

const round = (n: number) => Math.round(n);
const nis = (n: number) => `₪${round(n).toLocaleString("en-US")}`;

function annualizeDeposit(amount: number, frequency: string): number {
  return frequency === "MONTHLY" ? amount * 12 : amount;
}

export function computeDeploymentPlans(snapshot: SnapshotPayload, ctx: AnalyzerContext): DeploymentPlans {
  const notes: DeploymentNote[] = [];

  const monthlyExpenses = snapshot.items
    .filter((i) => i.cashFlow?.direction === "OUT" && i.cashFlow.amountBase !== null)
    .reduce((s, i) => {
      const amount = i.cashFlow!.amountBase!;
      return s + (i.cashFlow!.frequency === "ANNUAL" ? amount / 12 : i.cashFlow!.frequency === "MONTHLY" ? amount : 0);
    }, 0);

  const cashItems = valued(snapshot.items).filter(isCash);
  const cashBase = sum(cashItems);
  const cashIds = cashItems.map((i) => i.id);

  const base = {
    engineNote: "STRATEGY_LEVEL_ONLY_NEVER_PRODUCTS" as const,
    cashBase: round(cashBase),
  };

  if (monthlyExpenses <= 0) {
    return { ...base, monthlyExpensesBase: null, bufferTargetBase: null, freeCashBase: 0, variants: [], notes: ["EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED"] };
  }

  const targetMonths = Number(ctx.assumptions["emergency_fund_months"] ?? 6);
  const bufferTarget = monthlyExpenses * targetMonths;

  if (cashBase < bufferTarget) {
    const shortfall = bufferTarget - cashBase;
    const step: DeploymentStep = {
      id: "s1",
      kind: "BUFFER_TOP_UP",
      amountBase: round(shortfall),
      detail: `Cash covers less than the ${targetMonths}-month buffer — direct new savings to close the ${nis(shortfall)} shortfall before deploying anything.`,
      detailHe: `המזומן מכסה פחות מכרית של ${targetMonths} חודשים — נתבו חיסכון חדש לסגירת פער של ${nis(shortfall)} לפני כל פריסה אחרת.`,
      goalImpact: "Protects every goal: the buffer is what keeps a shock from forcing goal-asset sales.",
      goalImpactHe: "מגן על כל היעדים: הכרית היא שמונעת ממשבר לאלץ מכירת נכסי יעדים.",
      evidenceItemIds: cashIds,
    };
    notes.push("BUFFER_BELOW_TARGET");
    return {
      ...base,
      monthlyExpensesBase: round(monthlyExpenses),
      bufferTargetBase: round(bufferTarget),
      freeCashBase: 0,
      variants: [{ key: "BALANCED", steps: [step], leftoverBase: 0, summary: { investedBase: 0, debtRepaidBase: 0, interestSavedYearBase: 0, ceilingDepositsBase: 0 }, pros: [], prosHe: [], cons: [], consHe: [], risks: [], risksHe: [] }],
      notes,
    };
  }

  const freeCash = cashBase - bufferTarget;
  if (freeCash <= 0) notes.push("NO_FREE_CASH");

  // ---- shared inputs ---------------------------------------------------------
  const expensiveRate = Number(ctx.assumptions["expensive_debt_rate_pct"] ?? 8);
  const expectedReturn = Number(ctx.assumptions["expected_real_return_equity_pct"] ?? 4.5);
  const volatility = Number(ctx.assumptions["mc_return_volatility_pct"] ?? 15);

  const allDebts: Debt[] = [];
  for (const it of snapshot.items) {
    if (it.kind === "MORTGAGE" && it.mortgageTracks) {
      for (const t of it.mortgageTracks) {
        if (t.principalRemaining > 0) {
          allDebts.push({ itemId: it.id, name: `${it.name} · ${t.trackType}`, ratePct: t.annualRatePct, principal: t.principalRemaining });
        }
      }
    }
  }
  allDebts.sort((a, b) => b.ratePct - a.ratePct);
  const expensiveDebts = allDebts.filter((d) => d.ratePct > expensiveRate);

  const hish = ctx.taxRules["HISHTALMUT_CEILINGS"] as HishtalmutCeilings | undefined;
  const pens = ctx.taxRules["PENSION_CEILINGS"] as PensionCeilings | undefined;
  const hishCeiling = hish?.selfEmployedExemptDepositAnnualILS ?? 0;
  const pensCeiling = pens ? (pens.qualifiedIncomeAnnualILS * pens.maxBenefitDepositPctOfQualified) / 100 : 0;

  const depositsFor = (memberId: string, flowType: string): number => {
    let total = 0;
    for (const it of snapshot.items) {
      const cf = it.cashFlow;
      if (it.kind === "CASH_FLOW" && cf && cf.flowType === flowType && cf.amountBase !== null && it.ownerMemberIds.includes(memberId)) {
        total += annualizeDeposit(cf.amountBase, cf.frequency);
      }
    }
    return total;
  };

  const goalNames = snapshot.goals
    .filter((g) => g.requiredFundingBase !== null)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 2)
    .map((g) => g.name);
  const goalsLabel = goalNames.length > 0 ? goalNames.join(", ") : null;

  const investGoalImpact = (amount: number) => ({
    goalImpact: goalsLabel
      ? `Advances ${goalsLabel}: closes roughly ${nis(amount)} of today's total goal funding gap.`
      : `Closes roughly ${nis(amount)} of today's total goal funding gap.`,
    goalImpactHe: goalsLabel
      ? `מקדם את ${goalsLabel}: סוגר כ-${nis(amount)} מפער המימון הכולל של היעדים כיום.`
      : `סוגר כ-${nis(amount)} מפער המימון הכולל של היעדים כיום.`,
  });

  // ---- per-variant step builder ---------------------------------------------
  const buildVariant = (key: DeploymentVariantKey): DeploymentVariant => {
    let remaining = freeCash;
    const steps: DeploymentStep[] = [];
    let n = 0;
    const push = (s: Omit<DeploymentStep, "id">) => steps.push({ id: `${key.toLowerCase()}-s${++n}`, ...s });
    const summary: VariantSummary = { investedBase: 0, debtRepaidBase: 0, interestSavedYearBase: 0, ceilingDepositsBase: 0 };

    // 1. tax ceilings — deposits for the self-employed, payroll verification for employees
    if (snapshot.baseCurrency === "ILS") {
      for (const adult of snapshot.members.filter((m) => m.role === "ADULT")) {
        if (adult.employmentStatus === "SELF_EMPLOYED") {
          if (remaining > 0 && hishCeiling > 0) {
            const unused = hishCeiling - depositsFor(adult.id, "HISHTALMUT_CONTRIBUTION");
            if (unused > 0) {
              const amount = Math.min(remaining, unused);
              push({
                kind: "TAX_CEILING_HISHTALMUT", amountBase: round(amount),
                detail: `Deposit ${nis(amount)} to ${adult.name}'s keren hishtalmut — inside this year's exempt ceiling, growth is capital-gains free.`,
                detailHe: `הפקידו ${nis(amount)} לקרן ההשתלמות של ${adult.name} — בתוך התקרה הפטורה השנה, הצבירה פטורה ממס רווחי הון.`,
                goalImpact: "Tax-free compounding accelerates every long-term goal.",
                goalImpactHe: "צבירה פטורה ממס מאיצה כל יעד ארוך-טווח.",
                evidenceItemIds: [],
              });
              remaining -= amount;
              summary.ceilingDepositsBase += round(amount);
            }
          }
          if (remaining > 0 && pensCeiling > 0) {
            const unused = pensCeiling - depositsFor(adult.id, "PENSION_CONTRIBUTION");
            if (unused > 0) {
              const amount = Math.min(remaining, unused);
              push({
                kind: "TAX_CEILING_PENSION", amountBase: round(amount),
                detail: `Deposit ${nis(amount)} to ${adult.name}'s pension within the benefit ceiling — immediate deduction/credit value.`,
                detailHe: `הפקידו ${nis(amount)} לפנסיה של ${adult.name} בתוך תקרת ההטבה — שווי ניכוי/זיכוי מיידי.`,
                goalImpact: "Strengthens the retirement goal directly, with an immediate tax benefit.",
                goalImpactHe: "מחזק ישירות את יעד הפרישה, עם הטבת מס מיידית.",
                evidenceItemIds: [],
              });
              remaining -= amount;
              summary.ceilingDepositsBase += round(amount);
            }
          }
        } else {
          // EMPLOYED or unknown: benefits flow through payroll — verify, never deposit.
          push({
            kind: "TAX_VERIFY_PAYROLL", amountBase: 0,
            detail: `${adult.name}: contributions run through the employer — check one payslip confirms pension + hishtalmut deductions capture the ceilings (a section-46 supplemental deposit may apply if not).`,
            detailHe: `${adult.name}: ההפקדות רצות דרך המעסיק — בדקו בתלוש אחד שניכויי הפנסיה וההשתלמות ממצים את התקרות (אם לא — ייתכן שרלוונטית הפקדה משלימה לפי סעיף 46).`,
            goalImpact: "Confirms the tax benefits behind the retirement goal are fully captured.",
            goalImpactHe: "מוודא שהטבות המס שמאחורי יעד הפרישה ממוצות במלואן.",
            evidenceItemIds: [],
          });
        }
      }
    }

    // 2. debt repayment — per variant philosophy
    const debtsForVariant = key === "GROWTH" ? [] : key === "BALANCED" ? expensiveDebts : allDebts;
    for (const d of debtsForVariant) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, d.principal);
      const expensive = d.ratePct > expensiveRate;
      push({
        kind: expensive ? "REPAY_EXPENSIVE_DEBT" : "REPAY_DEBT", amountBase: round(amount),
        detail: `Repay ${nis(amount)} of "${d.name}" (${d.ratePct}%) — a guaranteed ${d.ratePct}% return${expensive ? ", above the expected investment return" : ` vs an expected ~${expectedReturn}% (real) from investing`}. Get the early-repayment fee quote first.`,
        detailHe: `פרעו ${nis(amount)} מ"${d.name}" (${d.ratePct}%) — תשואה מובטחת של ${d.ratePct}%${expensive ? ", מעל התשואה הצפויה מהשקעה" : ` לעומת ~${expectedReturn}% ריאלי צפוי מהשקעה`}. בקשו קודם דוח עמלת פירעון מוקדם.`,
        goalImpact: "Lowers future obligations and monthly pressure — indirect support for every goal.",
        goalImpactHe: "מקטין התחייבויות עתידיות ולחץ חודשי — תמיכה עקיפה בכל היעדים.",
        evidenceItemIds: [d.itemId],
      });
      remaining -= amount;
      summary.debtRepaidBase += round(amount);
      summary.interestSavedYearBase += round((amount * d.ratePct) / 100);
    }

    // 3. invest the rest toward the risk-derived target mix
    if (remaining > 0) {
      const targetGrowthPct = deriveTargetGrowthPct(ctx.assumptions);
      const unknownMaxPct = Number(ctx.assumptions["allocation_mix_unknown_max_pct"] ?? 50);
      const investable = valued(snapshot.items).filter((i) => i.kind === "ACCOUNT");
      let growth = 0;
      let known = 0;
      let unknown = 0;
      for (const i of investable) {
        const v = i.valueBase ?? 0;
        if (i.growthSharePct !== null && i.growthSharePct !== undefined) {
          growth += (v * i.growthSharePct) / 100;
          known += v;
        } else if (isCash(i)) {
          known += v;
        } else {
          unknown += v;
        }
      }
      const unknownSharePct = known + unknown > 0 ? (unknown / (known + unknown)) * 100 : 0;

      if (unknownSharePct > unknownMaxPct) {
        const gi = investGoalImpact(remaining);
        push({
          kind: "INVEST_GROWTH", amountBase: round(remaining),
          detail: `Invest the remaining ${nis(remaining)} — but first record the growth share of your accounts (too much of the portfolio is unknown to split growth/defensive responsibly).`,
          detailHe: `השקיעו את היתרה ${nis(remaining)} — אך קודם הזינו רכיב צמיחה לחשבונות (חלק גדול מדי מהתיק אינו ידוע כדי לפצל צמיחה/סולידי באחריות).`,
          ...gi, evidenceItemIds: [],
        });
        summary.investedBase += round(remaining);
        if (!notes.includes("MIX_UNKNOWN_INVEST_UNSPLIT")) notes.push("MIX_UNKNOWN_INVEST_UNSPLIT");
        remaining = 0;
      } else {
        const totalAfter = known + remaining;
        const desiredGrowth = (targetGrowthPct / 100) * totalAfter;
        const growthAmount = Math.min(remaining, Math.max(0, desiredGrowth - growth));
        const defensiveAmount = remaining - growthAmount;
        if (growthAmount > 0.5) {
          const gi = investGoalImpact(growthAmount);
          push({
            kind: "INVEST_GROWTH", amountBase: round(growthAmount),
            detail: `Invest ${nis(growthAmount)} in growth channels (equity-type tracks in existing wrappers or a taxable investment account) — moves the mix toward your ${targetGrowthPct}% target.`,
            detailHe: `השקיעו ${nis(growthAmount)} באפיקי צמיחה (מסלולים מוטי-צמיחה בעטיפות הקיימות או חשבון השקעות חייב) — מקרב את התמהיל ליעד ${targetGrowthPct}%.`,
            ...gi, evidenceItemIds: [],
          });
          remaining -= growthAmount;
          summary.investedBase += round(growthAmount);
        }
        if (defensiveAmount > 0.5) {
          const gi = investGoalImpact(defensiveAmount);
          push({
            kind: "INVEST_DEFENSIVE", amountBase: round(defensiveAmount),
            detail: `Place ${nis(defensiveAmount)} in defensive channels (bond-oriented tracks / deposits) to keep the mix at target.`,
            detailHe: `הניחו ${nis(defensiveAmount)} באפיקים סולידיים (מסלולים מוטי-אג"ח / פיקדונות) לשמירת התמהיל ביעד.`,
            ...gi, evidenceItemIds: [],
          });
          remaining -= defensiveAmount;
          summary.investedBase += round(defensiveAmount);
        }
      }
    }

    return { key, steps, leftoverBase: round(Math.max(0, remaining)), summary, ...buildNarrative(key, summary, expectedReturn, volatility, expensiveDebts.length > 0) };
  };

  const variants = [buildVariant("BALANCED"), buildVariant("GROWTH"), buildVariant("DEBT_FREE")];

  const texts = variants.flatMap((v) => [
    ...v.steps.flatMap((s) => [s.detail, s.detailHe, s.goalImpact, s.goalImpactHe]),
    ...v.pros, ...v.prosHe, ...v.cons, ...v.consHe, ...v.risks, ...v.risksHe,
  ]);
  const validation = validateStrategyText(texts);
  if (!validation.valid) throw new Error(`PRODUCT_REFERENCE_IN_DEPLOYMENT:${validation.pattern}`);

  return {
    ...base,
    monthlyExpensesBase: round(monthlyExpenses),
    bufferTargetBase: round(bufferTarget),
    freeCashBase: round(freeCash),
    variants,
    notes,
  };
}

function buildNarrative(
  key: DeploymentVariantKey,
  s: VariantSummary,
  expectedReturn: number,
  volatility: number,
  hasExpensiveDebt: boolean,
): Pick<DeploymentVariant, "pros" | "prosHe" | "cons" | "consHe" | "risks" | "risksHe"> {
  if (key === "GROWTH") {
    return {
      pros: [
        `Highest expected long-run value: ${s.investedBase > 0 ? `${nis(s.investedBase)} invested` : "everything invested"} at ~${expectedReturn}% expected real return.`,
        "Full liquidity retained — invested money stays reachable; nothing is locked into the house.",
      ],
      prosHe: [
        `תוחלת הערך הגבוהה ביותר לטווח ארוך: ${s.investedBase > 0 ? `${nis(s.investedBase)} מושקעים` : "הכול מושקע"} בתשואה ריאלית צפויה של ~${expectedReturn}%.`,
        "נזילות מלאה נשמרת — הכסף המושקע נשאר נגיש; דבר אינו ננעל בבית.",
      ],
      cons: [
        `The mortgage stays fully in place — payments and interest continue${hasExpensiveDebt ? ", INCLUDING tracks above the expensive-debt line" : ""}.`,
        "Expected return is an average, not a promise; the debt's interest is certain.",
      ],
      consHe: [
        `המשכנתא נשארת במלואה — ההחזרים והריבית ממשיכים${hasExpensiveDebt ? ", כולל מסלולים מעל קו החוב היקר" : ""}.`,
        "התשואה הצפויה היא ממוצע, לא הבטחה; ריבית החוב ודאית.",
      ],
      risks: [
        `Market risk: ~${volatility}% annual volatility means multi-year drawdowns are normal; money needed within ~5 years should not ride this path.`,
        "Behavioral risk: a crash + a full mortgage is when households capitulate — answer the drawdown question honestly.",
      ],
      risksHe: [
        `סיכון שוק: תנודתיות שנתית של ~${volatility}% פירושה שירידות רב-שנתיות הן נורמליות; כסף שנדרש בתוך ~5 שנים לא צריך לרכוב על המסלול הזה.`,
        "סיכון התנהגותי: מפולת + משכנתא מלאה הם הרגע שבו משקי בית נשברים — ענו בכנות על שאלת הירידות בשאלון.",
      ],
    };
  }
  if (key === "DEBT_FREE") {
    return {
      pros: [
        `A guaranteed, tax-free "return": ${nis(s.interestSavedYearBase)} interest avoided every year on ${nis(s.debtRepaidBase)} repaid — no market can promise that.`,
        "Lower future obligations and real psychological relief; resilience to income shocks rises immediately.",
      ],
      prosHe: [
        `"תשואה" מובטחת ופטורה ממס: ${nis(s.interestSavedYearBase)} ריבית שנחסכת מדי שנה על ${nis(s.debtRepaidBase)} שנפרעו — שום שוק לא מבטיח את זה.`,
        "התחייבויות עתידיות נמוכות יותר והקלה פסיכולוגית אמיתית; העמידות לזעזועי הכנסה עולה מיד.",
      ],
      cons: [
        `Expected opportunity cost: cheap tracks repaid at ~2-4% while investing targets ~${expectedReturn}% real — over decades the gap compounds.`,
        "Money sunk into the house is the least liquid form of wealth; getting it back means borrowing again or selling.",
        "Early-repayment fees (עמלת פירעון מוקדם) can eat part of the benefit — always get the quote first.",
      ],
      consHe: [
        `עלות הזדמנות צפויה: מסלולים זולים נפרעים ב~2-4% בעוד ההשקעה מכוונת ל~${expectedReturn}% ריאלי — לאורך עשורים הפער מצטבר.`,
        "כסף ששוקע בבית הוא צורת ההון הכי פחות נזילה; להחזיר אותו פירושו ללוות שוב או למכור.",
        "עמלות פירעון מוקדם עלולות לאכול חלק מהתועלת — תמיד בקשו את הדוח קודם.",
      ],
      risks: [
        "Inflation risk reversal: unlinked cheap debt is an inflation HEDGE — repaying it gives that up; CPI-linked tracks are the better repayment targets.",
        "Concentration: the household becomes even more real-estate-heavy after repayment.",
      ],
      risksHe: [
        "היפוך סיכון אינפלציה: חוב זול לא-צמוד הוא הגנה מפני אינפלציה — פירעונו מוותר עליה; מסלולים צמודי-מדד הם יעדי הפירעון העדיפים.",
        "ריכוזיות: משק הבית נעשה עוד יותר מוטה-נדל\"ן אחרי הפירעון.",
      ],
    };
  }
  return {
    pros: [
      "Math-driven middle path: only debt priced above the expected investment return is repaid; free tax money is captured; the rest compounds at the target mix.",
      "Every threshold is a registry assumption you control — the plan changes when your answers change.",
    ],
    prosHe: [
      "דרך אמצע מונחית-חישוב: נפרע רק חוב שמתומחר מעל התשואה הצפויה מהשקעה; כסף מס חינם נתפס; והיתרה צוברת בתמהיל היעד.",
      "כל סף הוא הנחת רגיסטרי בשליטתכם — התוכנית משתנה כשהתשובות שלכם משתנות.",
    ],
    cons: [
      "Neither pure story: some debt remains AND some market risk is taken — households that want one clean philosophy may prefer the other paths.",
    ],
    consHe: [
      "אף סיפור טהור: נשאר קצת חוב וגם נלקח קצת סיכון שוק — משקי בית שרוצים פילוסופיה נקייה אחת עשויים להעדיף את המסלולים האחרים.",
    ],
    risks: [
      `Standard market risk on the invested portion (~${volatility}% annual volatility); guaranteed-return logic applies only to the repaid tracks.`,
    ],
    risksHe: [
      `סיכון שוק רגיל על החלק המושקע (תנודתיות שנתית ~${volatility}%); היגיון התשואה המובטחת חל רק על המסלולים שנפרעו.`,
    ],
  };
}
