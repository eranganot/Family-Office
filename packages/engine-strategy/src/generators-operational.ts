import type { Finding } from "./findings";
import { RationaleSchema, type Rationale, type RecommendationDraft } from "./rationale";
import { validateStrategyText } from "./validator";

/**
 * M40a — operational finding → recommendation draft.
 *
 * Deliberately the SAME pipeline as `generators.ts`: same `Rationale` schema, same
 * product-reference validator, same throw-on-missing-action-items discipline. An
 * operational recommendation that skipped the validator would be the one place a
 * product name could reach the owner, so there is exactly one validator and both
 * cadences go through it.
 *
 * What operational drafts add on top of the strategic ones is the operating
 * metadata the Recommendation table already has columns for (M36): cadence,
 * difficulty, reversibility, the three impact horizons, and an expiry. Impact is
 * carried as explicit numbers rather than being re-derived from prose, because
 * the Opportunity Center sorts and totals by them.
 */

const nis = (v: unknown): string => `₪${Math.round(Number(v)).toLocaleString("en-US")}`;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

export type OperationalCadence =
  | "ONE_TIME"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL"
  | "EVENT_DRIVEN";
export type OperationalDifficulty = "TRIVIAL" | "EASY" | "MODERATE" | "HARD";
export type OperationalReversibility = "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE";

export interface OperationalDraft extends RecommendationDraft {
  cadence: OperationalCadence;
  difficulty: OperationalDifficulty;
  reversibility: OperationalReversibility;
  /** Recurring benefit per month, base currency. `null` when the action is one-off. */
  impactMonthlyBase: number | null;
  impactAnnualBase: number | null;
  /** Benefit realisable before 31 Dec of the current year, base currency. */
  impactEoyBase: number | null;
  /** ISO date (yyyy-mm-dd) after which the opportunity is gone. */
  expiresAtISO: string | null;
}

type Body = Omit<OperationalDraft, "actionItems" | "actionItemsHe">;

/** Months left in the calendar year, inclusive of the current one. */
function monthsLeftInYear(asOf: Date): number {
  return 12 - asOf.getUTCMonth();
}

const OPERATIONAL_GENERATORS: Record<string, (f: Finding, asOf: Date) => Body | null> = {
  OPERATIONAL_LEAKAGE_ABOVE_NOTICE: (f, asOf) => {
    const monthly = num(f.metrics["monthlyLeakageBase"]);
    const annual = num(f.metrics["annualLeakageBase"]);
    const trend = f.metrics["trendPct"];
    const rising = typeof trend === "number" && trend > 0;
    const trendEn = rising
      ? `It is rising: the latest month is ${trend}% above the earlier months in the window.`
      : `It is not currently rising, which makes this a cleanup rather than an emergency.`;
    const trendHe = rising
      ? `המגמה עולה: החודש האחרון גבוה ב-${trend}% מהחודשים הקודמים בחלון.`
      : `אין כרגע מגמת עלייה, ולכן מדובר בניקוי ולא בשריפה.`;
    const rationale: Rationale = {
      why: `Fees, interest and conversion spreads cost the household about ${nis(monthly)} a month (${nis(annual)} a year), above the ${nis(f.metrics["thresholdBase"])} notice threshold. ${trendEn} This is money that buys nothing, so removing it is a pure gain with no risk taken in exchange. Largest sources: ${f.metrics["topSources"]}.`,
      benefits: [
        `Recovers up to ${nis(annual)} a year with no market exposure and no lock-up`,
        "Improves the monthly surplus permanently, not once",
        "Every shekel recovered is already after tax",
      ],
      risks: [
        "Some charges are the price of a service the household actually wants; cancelling blind can cost more than it saves",
        "A bank fee track can be renegotiated but is rarely removed entirely",
      ],
      tradeoffs: [
        "Renegotiating or switching accounts takes owner time and some friction",
        "Consolidating to fewer accounts can reduce fees but also reduces redundancy",
      ],
      taxImplications: "None. Fee reduction is not a taxable event and the saving is already net.",
      liquidityImplications: "Directly increases monthly free cash flow; no capital is tied up.",
      timeHorizon: "IMMEDIATE",
      sensitivity: `Based on ${f.metrics["monthsObserved"]} observed month(s); a month with unclassified or unconverted rows is excluded rather than counted as zero, so the true figure is at least this high.`,
      alternatives: [
        "Negotiate the existing fee track before moving anything",
        "Consolidate activity into fewer accounts to fall under fee waivers",
        "Address only the single largest source first and re-measure",
      ],
      expectedImpact: `Reduce recurring financial drag by up to ${nis(monthly)} per month.`,
    };
    const rationaleHe: Rationale = {
      why: `עמלות, ריבית ומרווחי המרה עולים למשק הבית כ-${nis(monthly)} בחודש (${nis(annual)} בשנה), מעל סף ההתראה של ${nis(f.metrics["thresholdBase"])}. ${trendHe} זהו כסף שאינו קונה דבר, ולכן הסרתו היא רווח נקי ללא נטילת סיכון. המקורות הגדולים: ${f.metrics["topSources"]}.`,
      benefits: [
        `החזר של עד ${nis(annual)} בשנה ללא חשיפה לשוק וללא נעילת כספים`,
        "שיפור קבוע בעודף החודשי, לא חד-פעמי",
        "כל שקל שנחסך הוא כבר אחרי מס",
      ],
      risks: [
        "חלק מהחיובים הם מחיר של שירות שמשק הבית באמת רוצה; ביטול עיוור עלול לעלות יותר ממה שיחסוך",
        "מסלול עמלות בנקאי ניתן למשא ומתן אך רק לעתים רחוקות מבוטל לגמרי",
      ],
      tradeoffs: [
        "משא ומתן או מעבר בנק דורשים זמן וחיכוך",
        "ריכוז לחשבונות מעטים מקטין עמלות אך גם מקטין יתירות",
      ],
      taxImplications: "אין. הפחתת עמלות אינה אירוע מס והחיסכון הוא כבר נטו.",
      liquidityImplications: "מגדיל ישירות את התזרים החודשי הפנוי; לא נכלא הון.",
      timeHorizon: "IMMEDIATE",
      sensitivity: `מבוסס על ${f.metrics["monthsObserved"]} חודשים שנצפו; חודש עם שורות לא מסווגות או ללא שער חליפין מוחרג ולא נספר כאפס, ולכן הנתון האמיתי גבוה לפחות כמו זה.`,
      alternatives: [
        "לנהל משא ומתן על מסלול העמלות הקיים לפני כל מעבר",
        "לרכז פעילות לפחות חשבונות כדי להיכנס לפטורים",
        "לטפל תחילה במקור הגדול היחיד ולמדוד מחדש",
      ],
      expectedImpact: `הפחתת שחיקה פיננסית חוזרת בעד ${nis(monthly)} לחודש.`,
    };
    return {
      type: "REDUCE_FINANCIAL_DRAG",
      title: `Cut recurring fees and charges (${nis(monthly)}/month)`,
      titleHe: `לצמצם עמלות וחיובים חוזרים (${nis(monthly)} לחודש)`,
      rationale,
      rationaleHe,
      subscores: {
        impact: Math.min(90, Math.round((monthly / Math.max(1, num(f.metrics["thresholdBase"]))) * 30)),
        ease: 80,
        taxBenefit: 0,
        riskReduction: 25,
        goalContribution: 45,
        urgency: rising ? 70 : 45,
      },
      confidence: f.severity === "WARNING" ? 80 : 70,
      evidenceItemIds: f.evidenceItemIds,
      goalTypesImproved: ["FINANCIAL_INDEPENDENCE", "EMERGENCY_FUND"],
      assumptionKeysUsed: ["leakage_bank_fee_monthly_notice_base", "operations_baseline_months"],
      cadence: "MONTHLY",
      difficulty: "EASY",
      reversibility: "REVERSIBLE",
      impactMonthlyBase: monthly,
      impactAnnualBase: annual,
      impactEoyBase: Math.round(monthly * monthsLeftInYear(asOf) * 100) / 100,
      expiresAtISO: null,
    };
  },

  OPERATIONAL_SUBSCRIPTION_REVIEW_DUE: (f, asOf) => {
    const monthly = num(f.metrics["monthlyTotalBase"]);
    const annual = num(f.metrics["annualTotalBase"]);
    const count = num(f.metrics["subscriptionCount"]);
    const rationale: Rationale = {
      why: `${count} recurring charge(s) totalling ${nis(monthly)} a month have been billing on a steady monthly cadence for more than ${f.metrics["dormantDays"]} days. WealthOS cannot see whether they are used — it has no usage data — so this is a prompt to confirm, not a claim that they are wasted. The largest is ${f.metrics["largestMerchant"]} at ${nis(f.metrics["largestMonthlyBase"])} a month.`,
      benefits: [
        `Up to ${nis(annual)} a year recovered if all of them turn out to be unwanted`,
        "One review covers charges that would otherwise renew silently for years",
        "Surfaces duplicate services paid for twice under different names",
      ],
      risks: [
        "Cancelling something still in use costs more to reinstate than it saved",
        "Some annual plans do not refund a mid-term cancellation",
      ],
      tradeoffs: [
        "Reviewing each one takes time that may exceed the saving on the small ones",
        "A cheaper plan tier can mean losing a feature the household relies on",
      ],
      taxImplications:
        "None for household subscriptions. A business-deductible subscription should be checked separately before cancelling.",
      liquidityImplications: "Each cancellation converts directly into monthly free cash flow.",
      timeHorizon: "IMMEDIATE",
      sensitivity: `Detection requires at least 3 charges, a 25–35 day cadence and a stable amount, so genuinely irregular spending is not flagged. Charges that already stopped are excluded — cancelling them would save nothing. Contractual obligations are NEVER listed here: ${f.metrics["excludedContractual"]} recurring charge(s) were excluded as mortgage, loan or insurance payments, and ${f.metrics["excludedUnclassified"]} because they are not yet classified. Classify those in Operations → Transactions if you want them considered.`,
      alternatives: [
        "Downgrade to a lower tier instead of cancelling",
        "Switch annual billing on for the ones you keep, where it is cheaper",
        "Cancel only the largest one and re-measure next month",
      ],
      expectedImpact: `Confirm or release up to ${nis(monthly)} per month of recurring charges.`,
    };
    const rationaleHe: Rationale = {
      why: `${count} חיובים חוזרים בסך ${nis(monthly)} לחודש מחויבים בקצב חודשי קבוע כבר יותר מ-${f.metrics["dormantDays"]} ימים. ל-WealthOS אין נתוני שימוש ולכן אין באפשרותו לדעת אם הם מנוצלים — זו בקשה לאישור, לא קביעה שהם מבוזבזים. הגדול ביותר הוא ${f.metrics["largestMerchant"]} בסך ${nis(f.metrics["largestMonthlyBase"])} לחודש.`,
      benefits: [
        `עד ${nis(annual)} בשנה אם יתברר שאין בהם צורך`,
        "בדיקה אחת מכסה חיובים שאחרת היו מתחדשים בשקט שנים",
        "חושף שירותים כפולים שמשולמים פעמיים תחת שמות שונים",
      ],
      risks: [
        "ביטול שירות שעדיין בשימוש יקר יותר להחזרה ממה שנחסך",
        "חלק מהתוכניות השנתיות אינן מחזירות כסף על ביטול באמצע התקופה",
      ],
      tradeoffs: [
        "בדיקה פרטנית גוזלת זמן שעשוי לעלות על החיסכון בקטנים",
        "מעבר למסלול זול יותר עלול לוותר על יכולת שמשק הבית נשען עליה",
      ],
      taxImplications: "אין לגבי מנויים ביתיים. מנוי שמוכר כהוצאה עסקית יש לבדוק בנפרד לפני ביטול.",
      liquidityImplications: "כל ביטול מתורגם ישירות לתזרים חודשי פנוי.",
      timeHorizon: "IMMEDIATE",
      sensitivity: `הזיהוי דורש לפחות 3 חיובים, קצב של 25–35 ימים וסכום יציב, ולכן הוצאה לא סדירה אינה מסומנת. חיובים שכבר הפסיקו מוחרגים — ביטולם לא יחסוך דבר. התחייבויות חוזיות לעולם אינן מופיעות כאן: ${f.metrics["excludedContractual"]} חיובים חוזרים הוחרגו כתשלומי משכנתא, הלוואה או ביטוח, ו-${f.metrics["excludedUnclassified"]} משום שטרם סווגו. סווגו אותם בתפעול ← תנועות אם ברצונכם שייכללו.`,
      alternatives: [
        "לרדת למסלול נמוך יותר במקום לבטל",
        "לעבור לחיוב שנתי במה שנשאר, היכן שזה זול יותר",
        "לבטל רק את הגדול ביותר ולמדוד מחדש בחודש הבא",
      ],
      expectedImpact: `לאשר או לשחרר עד ${nis(monthly)} לחודש בחיובים חוזרים.`,
    };
    return {
      type: "REVIEW_RECURRING_SUBSCRIPTIONS",
      title: `Review ${count} recurring charge(s) worth ${nis(monthly)}/month`,
      titleHe: `לבדוק ${count} חיובים חוזרים בסך ${nis(monthly)} לחודש`,
      rationale,
      rationaleHe,
      subscores: {
        impact: Math.min(75, Math.round(monthly / 10)),
        ease: 85,
        taxBenefit: 0,
        riskReduction: 15,
        goalContribution: 40,
        urgency: 35,
      },
      confidence: 70,
      evidenceItemIds: f.evidenceItemIds,
      goalTypesImproved: ["FINANCIAL_INDEPENDENCE"],
      assumptionKeysUsed: ["leakage_subscription_dormant_days"],
      cadence: "SEMI_ANNUAL",
      difficulty: "TRIVIAL",
      reversibility: "PARTIALLY_REVERSIBLE",
      impactMonthlyBase: monthly,
      impactAnnualBase: annual,
      impactEoyBase: Math.round(monthly * monthsLeftInYear(asOf) * 100) / 100,
      expiresAtISO: null,
    };
  },

  // No `asOf`: this generator leaves every impact column null, so there is no end-of-year
  // figure to derive. See the impactMonthlyBase comment below for why.
  OPERATIONAL_RENEGOTIABLE_COMMITMENTS: (f) => {
    const monthly = num(f.metrics["monthlyTotalBase"]);
    const annual = num(f.metrics["annualTotalBase"]);
    const count = num(f.metrics["commitmentCount"]);
    // NOTE: no saving is estimated anywhere below. WealthOS does not know the market rate
    // for the owner's mobile plan or his insurance cover, and a "you could save 30%" figure
    // would be exactly the confident-wrong number M40a already shipped once. The observed
    // SPEND is real; the saving is explicitly unknown until he gets a quote.
    const rationale: Rationale = {
      why: `${count} recurring commitment(s) costing ${nis(monthly)} a month (${nis(annual)} a year) are of a kind you can keep and pay less for — ${f.metrics["groups"]}. These renew silently, and a contract that has rolled over for years is usually priced above what the same supplier offers a new customer. The largest is ${f.metrics["largestMerchant"]} at ${nis(f.metrics["largestMonthlyBase"])} a month.`,
      benefits: [
        "Keeps the service and the cover exactly as they are — only the price changes",
        "A single call or comparison usually covers a whole group at once",
        "Any reduction is permanent and already after tax",
      ],
      risks: [
        "A cheaper quote can hide reduced cover or a shorter commitment window — compare terms, not just the monthly figure",
        "Switching supplier can involve a setup fee or a transition gap",
      ],
      tradeoffs: [
        "Comparing and negotiating takes owner time",
        "A longer lock-in usually buys a lower price, at the cost of flexibility",
      ],
      taxImplications: "None. Reducing a household bill is not a taxable event.",
      liquidityImplications: "Any reduction shows up directly in monthly free cash flow.",
      timeHorizon: "SHORT",
      sensitivity: `This figure is your CURRENT spend, observed from ${count} recurring charge(s) — it is not an estimated saving. WealthOS does not know the market rate for these services, so how much (if anything) comes off is only known once you have a competing quote.`,
      alternatives: [
        "Ask the current supplier to match a competitor before switching — usually the fastest route",
        "Renegotiate only the largest one and re-measure next month",
        "For insurance, ask to reprice the SAME cover rather than changing it",
      ],
      expectedImpact: `Put ${nis(monthly)} a month of recurring spend up for repricing.`,
    };
    const rationaleHe: Rationale = {
      why: `${count} התחייבויות חוזרות בעלות ${nis(monthly)} לחודש (${nis(annual)} לשנה) הן מסוג שאפשר להשאיר ולשלם עליו פחות — ${f.metrics["groups"]}. הן מתחדשות בשקט, וחוזה שמתגלגל שנים מתומחר בדרך כלל מעל מה שאותו ספק מציע ללקוח חדש. הגדולה ביותר היא ${f.metrics["largestMerchant"]} בסך ${nis(f.metrics["largestMonthlyBase"])} לחודש.`,
      benefits: [
        "השירות והכיסוי נשארים בדיוק כפי שהם — רק המחיר משתנה",
        "שיחה אחת או השוואה אחת מכסות בדרך כלל קבוצה שלמה",
        "כל הפחתה היא קבועה וכבר אחרי מס",
      ],
      risks: [
        "הצעה זולה יותר עלולה להסתיר כיסוי מצומצם או תקופת התחייבות קצרה — השוו תנאים, לא רק את הסכום החודשי",
        "מעבר ספק עשוי לכלול דמי התקנה או פער במעבר",
      ],
      tradeoffs: [
        "השוואה ומשא ומתן גוזלים זמן",
        "התחייבות ארוכה יותר בדרך כלל קונה מחיר נמוך יותר, במחיר גמישות",
      ],
      taxImplications: "אין. הפחתת חשבון ביתי אינה אירוע מס.",
      liquidityImplications: "כל הפחתה מופיעה ישירות בתזרים החודשי הפנוי.",
      timeHorizon: "SHORT",
      sensitivity: `הסכום הזה הוא ההוצאה הנוכחית שלכם, שנצפתה מ-${count} חיובים חוזרים — הוא אינו אומדן חיסכון. ל-WealthOS אין נתונים על מחיר השוק לשירותים האלה, ולכן כמה (אם בכלל) יירד יתברר רק מול הצעה מתחרה.`,
      alternatives: [
        "לבקש מהספק הנוכחי להשוות להצעה מתחרה לפני מעבר — בדרך כלל המסלול המהיר ביותר",
        "לנהל משא ומתן רק על הגדולה ביותר ולמדוד מחדש בחודש הבא",
        "בביטוח — לבקש תמחור מחדש של אותו כיסוי, לא שינוי שלו",
      ],
      expectedImpact: `להעמיד ${nis(monthly)} לחודש של הוצאה חוזרת לתמחור מחדש.`,
    };
    return {
      type: "RENEGOTIATE_RECURRING_COMMITMENTS",
      title: `Reprice ${count} recurring commitment(s) costing ${nis(monthly)}/month`,
      titleHe: `לתמחר מחדש ${count} התחייבויות חוזרות בעלות ${nis(monthly)} לחודש`,
      rationale,
      rationaleHe,
      subscores: {
        impact: Math.min(70, Math.round(monthly / 20)),
        ease: 60,
        taxBenefit: 0,
        riskReduction: 10,
        goalContribution: 40,
        urgency: 30,
      },
      confidence: 60, // the spend is observed; the saving is not, and the score says so
      evidenceItemIds: f.evidenceItemIds,
      goalTypesImproved: ["FINANCIAL_INDEPENDENCE"],
      assumptionKeysUsed: ["opportunity_min_monthly_base"],
      cadence: "ANNUAL",
      difficulty: "MODERATE",
      reversibility: "REVERSIBLE",
      // Deliberately null: the impact columns feed the Opportunity Center's headline
      // "proposed savings" total, and putting current SPEND there would claim the whole
      // bill as a saving. That is the M40a mistake in a different costume.
      impactMonthlyBase: null,
      impactAnnualBase: null,
      impactEoyBase: null,
      expiresAtISO: null,
    };
  },

  OPERATIONAL_STATUTORY_DEADLINE_NEAR: (f) => {
    const days = num(f.metrics["nearestDaysAway"]);
    const cash = num(f.metrics["cashImpactBase"]);
    const rationale: Rationale = {
      why: `${f.metrics["eventCount"]} statutory deadline(s) fall inside the next ${f.metrics["windowDays"]} days. The nearest is "${f.metrics["nearestTitleEn"]}" on ${f.metrics["nearestDueDate"]}, ${days} day(s) away. A statutory date is not a preference — the consequence of missing it is external and does not scale down with how busy the month was.${cash > 0 ? ` Committed cash inside the window: ${nis(cash)}.` : ""}`,
      benefits: [
        "Avoids interest, linkage and penalties that arise purely from timing",
        "Keeps annual ceilings usable — an unused ceiling does not carry forward",
        "Removes the scramble of discovering the date after it has passed",
      ],
      risks: [
        "Acting at the last moment leaves no room for a bank or institution to be slow",
        "Funds must be cleared, not merely sent, before the date",
      ],
      tradeoffs: [
        `Meeting the date may require pulling ${nis(cash)} forward from other uses this month`,
      ],
      taxImplications:
        "These dates are the tax and national-insurance calendar itself; the figures behind them come from the registry and are shown with their review status.",
      liquidityImplications:
        cash > 0
          ? `${nis(cash)} of cash-impacting obligations sit inside the window and are already subtracted from Safe-to-Spend.`
          : "No cash-impacting obligation in this group; the cost of missing it is penalty risk, not outflow.",
      timeHorizon: "IMMEDIATE",
      sensitivity: `Dates come from the seeded statutory calendar. Where the underlying 2026 figures are still marked unreviewed, the date stands but the amount should be confirmed before relying on it.`,
      alternatives: [
        "Complete the action early in the window rather than on the date",
        "Set the standing instruction now so the next occurrence is automatic",
      ],
      expectedImpact: `Meet ${f.metrics["eventCount"]} statutory date(s) on time, avoiding penalty and forfeited allowances.`,
    };
    const rationaleHe: Rationale = {
      why: `${f.metrics["eventCount"]} מועדים סטטוטוריים חלים ב-${f.metrics["windowDays"]} הימים הקרובים. הקרוב ביותר הוא "${f.metrics["nearestTitleHe"]}" בתאריך ${f.metrics["nearestDueDate"]}, בעוד ${days} ימים. מועד סטטוטורי אינו העדפה — המחיר של פספוס הוא חיצוני ואינו קטן לפי כמה עמוס היה החודש.${cash > 0 ? ` מזומן מחויב בתוך החלון: ${nis(cash)}.` : ""}`,
      benefits: [
        "מונע ריבית, הצמדה וקנסות שנובעים מעיתוי בלבד",
        "שומר על תקרות שנתיות ברות-ניצול — תקרה שלא נוצלה אינה נגררת לשנה הבאה",
        "מבטל את הבהלה של גילוי המועד אחרי שחלף",
      ],
      risks: [
        "פעולה ברגע האחרון אינה משאירה מרווח לאיטיות של בנק או גוף מוסדי",
        "הכספים צריכים להיפרע בפועל, לא רק להישלח, לפני המועד",
      ],
      tradeoffs: [`עמידה במועד עשויה לדרוש הקדמת ${nis(cash)} משימושים אחרים החודש`],
      taxImplications:
        "מועדים אלה הם לוח השנה של המס והביטוח הלאומי עצמו; הנתונים שמאחוריהם מגיעים מהרג'יסטרי ומוצגים עם סטטוס האישור שלהם.",
      liquidityImplications:
        cash > 0
          ? `${nis(cash)} של התחייבויות תזרימיות נמצאות בתוך החלון וכבר מנוכות מ-Safe-to-Spend.`
          : "אין התחייבות תזרימית בקבוצה זו; מחיר הפספוס הוא סיכון קנס, לא תזרים.",
      timeHorizon: "IMMEDIATE",
      sensitivity: `המועדים מגיעים מלוח השנה הסטטוטורי שנזרע. במקום שבו נתוני 2026 עדיין מסומנים כלא-מאושרים, המועד תקף אך יש לאמת את הסכום לפני הסתמכות.`,
      alternatives: [
        "לבצע את הפעולה בתחילת החלון ולא במועד עצמו",
        "לקבוע הוראה קבועה עכשיו כדי שהמופע הבא יהיה אוטומטי",
      ],
      expectedImpact: `עמידה ב-${f.metrics["eventCount"]} מועדים סטטוטוריים, ומניעת קנסות ואיבוד הטבות.`,
    };
    return {
      type: "MEET_STATUTORY_DEADLINE",
      title: `Statutory deadline in ${days} day(s): ${f.metrics["nearestTitleEn"]}`,
      titleHe: `מועד סטטוטורי בעוד ${days} ימים: ${f.metrics["nearestTitleHe"]}`,
      rationale,
      rationaleHe,
      subscores: {
        impact: 60,
        ease: 70,
        taxBenefit: 70,
        riskReduction: 60,
        goalContribution: 40,
        // Urgency is proximity, not amount: a small ceiling that closes this week
        // outranks a large one that closes in two months.
        urgency: Math.max(40, Math.round(100 - (days / Math.max(1, num(f.metrics["windowDays"]))) * 60)),
      },
      confidence: f.severity === "WARNING" ? 85 : 75,
      evidenceItemIds: f.evidenceItemIds,
      goalTypesImproved: ["RETIREMENT", "FINANCIAL_INDEPENDENCE"],
      assumptionKeysUsed: ["calendar_upcoming_window_days"],
      cadence: "EVENT_DRIVEN",
      difficulty: "EASY",
      reversibility: "IRREVERSIBLE",
      impactMonthlyBase: null,
      impactAnnualBase: null,
      impactEoyBase: null,
      expiresAtISO: String(f.metrics["expiresAtISO"] ?? "") || null,
    };
  },

  OPERATIONAL_HOUSEHOLD_REVIEW_DUE: (f) => {
    const days = num(f.metrics["nearestDaysAway"]);
    const rationale: Rationale = {
      why: `${f.metrics["eventCount"]} household review(s) you scheduled fall inside the next ${f.metrics["windowDays"]} days, the nearest being "${f.metrics["nearestTitleEn"]}" on ${f.metrics["nearestDueDate"]}. These are your own dates, not statutory ones — the cost of slipping is drift, not penalty, which is exactly why they slip.`,
      benefits: [
        "Catches contracts that renew on autopilot at a worse rate",
        "Keeps the household's own decisions on a cadence rather than on mood",
        "Each completed review feeds the next month's figures",
      ],
      risks: [
        "A review done without the underlying document produces a false sense of having checked",
      ],
      tradeoffs: ["Owner time spent reviewing is time not spent elsewhere"],
      taxImplications:
        "None directly; a review may surface a tax-relevant action, which is raised separately.",
      liquidityImplications:
        "None directly. Cash-impacting items in the window are already reflected in Safe-to-Spend.",
      timeHorizon: "SHORT",
      sensitivity:
        "These dates are the ones you set. Where a template date was suggested rather than chosen, the calendar marks it as a suggestion.",
      alternatives: [
        "Reschedule the date now if it does not suit",
        "Disable the recurring review if it no longer applies",
      ],
      expectedImpact: `Complete ${f.metrics["eventCount"]} scheduled review(s) before they lapse.`,
    };
    const rationaleHe: Rationale = {
      why: `${f.metrics["eventCount"]} בדיקות שקבעתם חלות ב-${f.metrics["windowDays"]} הימים הקרובים, והקרובה היא "${f.metrics["nearestTitleHe"]}" בתאריך ${f.metrics["nearestDueDate"]}. אלה המועדים שלכם ולא מועדים סטטוטוריים — מחיר הדחייה הוא סחף ולא קנס, וזו בדיוק הסיבה שהם נדחים.`,
      benefits: [
        "תופס חוזים שמתחדשים אוטומטית בתנאים גרועים יותר",
        "שומר על קצב קבוע להחלטות של משק הבית במקום החלטה לפי מצב רוח",
        "כל בדיקה שהושלמה מזינה את נתוני החודש הבא",
      ],
      risks: ["בדיקה ללא המסמך עצמו יוצרת תחושת שווא של 'בדקנו'"],
      tradeoffs: ["זמן שמושקע בבדיקה אינו מושקע במקום אחר"],
      taxImplications: "אין ישירות; בדיקה עשויה לחשוף פעולה רלוונטית למס, שתעלה בנפרד.",
      liquidityImplications:
        "אין ישירות. פריטים תזרימיים בחלון כבר משתקפים ב-Safe-to-Spend.",
      timeHorizon: "SHORT",
      sensitivity:
        "אלה המועדים שהגדרתם. היכן שמועד הוצע מתבנית ולא נבחר, היומן מסמן זאת כהצעה.",
      alternatives: [
        "לשנות את המועד עכשיו אם אינו מתאים",
        "לבטל את הבדיקה החוזרת אם אינה רלוונטית עוד",
      ],
      expectedImpact: `להשלים ${f.metrics["eventCount"]} בדיקות מתוכננות לפני שיפוגו.`,
    };
    return {
      type: "COMPLETE_SCHEDULED_REVIEW",
      title: `${f.metrics["eventCount"]} scheduled review(s) due within ${f.metrics["windowDays"]} days`,
      titleHe: `${f.metrics["eventCount"]} בדיקות מתוכננות בתוך ${f.metrics["windowDays"]} ימים`,
      rationale,
      rationaleHe,
      subscores: {
        impact: 35,
        ease: 75,
        taxBenefit: 10,
        riskReduction: 45,
        goalContribution: 30,
        urgency: Math.max(20, Math.round(70 - (days / Math.max(1, num(f.metrics["windowDays"]))) * 50)),
      },
      confidence: 65,
      evidenceItemIds: f.evidenceItemIds,
      goalTypesImproved: ["FINANCIAL_INDEPENDENCE"],
      assumptionKeysUsed: ["calendar_upcoming_window_days"],
      cadence: "EVENT_DRIVEN",
      difficulty: "TRIVIAL",
      reversibility: "REVERSIBLE",
      impactMonthlyBase: null,
      impactAnnualBase: null,
      impactEoyBase: null,
      expiresAtISO: String(f.metrics["expiresAtISO"] ?? "") || null,
    };
  },
};

type M = Record<string, number | string>;

/** Concrete steps per operational code. A missing code THROWS — same rule as M23c. */
const OPERATIONAL_ACTION_ITEMS: Record<
  string,
  (m: M) => { actionItems: string[]; actionItemsHe: string[] }
> = {
  OPERATIONAL_LEAKAGE_ABOVE_NOTICE: (m) => ({
    actionItems: [
      `Open Operations → Transactions filtered to the financial-drag class and confirm the ${nis(m["monthlyLeakageBase"])}/month is really fees, not a miscategorised expense.`,
      `Take the largest source (${m["topSources"]}) to your bank and ask for a cheaper fee track in writing; quote the monthly total.`,
      `Re-check next month: the same view should show a lower figure, and if it does not, the change was not applied.`,
    ],
    actionItemsHe: [
      `פתחו תפעול ← תנועות מסונן לקטגוריית השחיקה הפיננסית וודאו ש-${nis(m["monthlyLeakageBase"])} לחודש הם באמת עמלות ולא הוצאה שסווגה שגוי.`,
      `קחו את המקור הגדול (${m["topSources"]}) לבנק ובקשו מסלול עמלות זול יותר בכתב; ציינו את הסכום החודשי.`,
      `בדקו שוב בחודש הבא: אותו מסך צריך להראות סכום נמוך יותר, ואם לא — השינוי לא יושם.`,
    ],
  }),
  OPERATIONAL_SUBSCRIPTION_REVIEW_DUE: (m) => ({
    actionItems: [
      `Go through the ${m["subscriptionCount"]} charge(s) listed (${m["merchants"]}) and mark each as keep, downgrade, or cancel.`,
      `Start with ${m["largestMerchant"]} at ${nis(m["largestMonthlyBase"])}/month — it is the largest single decision here.`,
      `Cancel directly with the provider, then confirm next month that the charge actually stopped; a cancellation that was not processed looks identical until the statement arrives.`,
    ],
    actionItemsHe: [
      `עברו על ${m["subscriptionCount"]} החיובים (${m["merchants"]}) וסמנו כל אחד: להשאיר, להוריד מסלול, או לבטל.`,
      `התחילו מ-${m["largestMerchant"]} בסך ${nis(m["largestMonthlyBase"])} לחודש — זו ההחלטה הגדולה ביותר כאן.`,
      `בטלו מול הספק ישירות, ואז ודאו בחודש הבא שהחיוב אכן פסק; ביטול שלא נקלט נראה זהה עד שמגיע הדף.`,
    ],
  }),
  OPERATIONAL_RENEGOTIABLE_COMMITMENTS: (m) => ({
    actionItems: [
      `Get one competing quote for ${m["largestMerchant"]} (${nis(m["largestMonthlyBase"])}/month) — the largest of the ${m["commitmentCount"]} listed.`,
      `Call your current supplier with that quote and ask them to match it. Say you are comparing; a rolled-over contract is priced for someone who never asks.`,
      `For insurance, ask to reprice the SAME cover — do not reduce it. Whether your cover is adequate is a separate question the strategy engine tracks.`,
      `Re-check next month: the charge in Operations → Transactions should be lower, and if it is not, the new price was never applied.`,
    ],
    actionItemsHe: [
      `השיגו הצעה מתחרה אחת ל-${m["largestMerchant"]} (${nis(m["largestMonthlyBase"])} לחודש) — הגדולה מבין ${m["commitmentCount"]} שברשימה.`,
      `התקשרו לספק הנוכחי עם ההצעה ובקשו שישווה. אמרו שאתם משווים; חוזה שמתגלגל מתומחר למי שלא שואל.`,
      `בביטוח — בקשו תמחור מחדש של אותו כיסוי, אל תקטינו אותו. השאלה אם הכיסוי מספיק היא שאלה נפרדת שמנוע האסטרטגיה עוקב אחריה.`,
      `בדקו בחודש הבא: החיוב בתפעול ← תנועות אמור לרדת, ואם לא — המחיר החדש לא יושם.`,
    ],
  }),
  OPERATIONAL_STATUTORY_DEADLINE_NEAR: (m) => ({
    actionItems: [
      `Open Operations → Calendar and read the ${m["eventCount"]} item(s) due inside ${m["windowDays"]} days: ${m["titlesEn"]}.`,
      `Act on "${m["nearestTitleEn"]}" (${m["nearestDueDate"]}) first — it is ${m["nearestDaysAway"]} day(s) away. Allow clearing time; the money must be credited by the date, not sent on it.`,
      `Mark the calendar item done once confirmed, so the next occurrence is generated from a real completion.`,
    ],
    actionItemsHe: [
      `פתחו תפעול ← יומן וקראו את ${m["eventCount"]} הפריטים שבתוך ${m["windowDays"]} ימים: ${m["titlesHe"]}.`,
      `טפלו קודם ב-"${m["nearestTitleHe"]}" (${m["nearestDueDate"]}) — בעוד ${m["nearestDaysAway"]} ימים. השאירו זמן סליקה; הכסף צריך להיזקף עד המועד, לא להישלח בו.`,
      `סמנו את הפריט ביומן כבוצע לאחר אישור, כדי שהמופע הבא ייווצר מהשלמה אמיתית.`,
    ],
  }),
  OPERATIONAL_HOUSEHOLD_REVIEW_DUE: (m) => ({
    actionItems: [
      `Review the ${m["eventCount"]} item(s) scheduled inside ${m["windowDays"]} days: ${m["titlesEn"]}.`,
      `Do "${m["nearestTitleEn"]}" (${m["nearestDueDate"]}) with the actual policy or statement open — a review from memory is not a review.`,
      `If a date no longer suits, change it in Operations → Recurring rather than letting it lapse.`,
    ],
    actionItemsHe: [
      `בדקו את ${m["eventCount"]} הפריטים שמתוכננים בתוך ${m["windowDays"]} ימים: ${m["titlesHe"]}.`,
      `בצעו את "${m["nearestTitleHe"]}" (${m["nearestDueDate"]}) כשהפוליסה או הדף פתוחים מולכם — בדיקה מהזיכרון אינה בדיקה.`,
      `אם מועד אינו מתאים עוד, שנו אותו בתפעול ← חוזרות במקום לתת לו לחלוף.`,
    ],
  }),
};

export function operationalActionItemsFor(
  code: string,
  m: M,
): { actionItems: string[]; actionItemsHe: string[] } {
  const builder = OPERATIONAL_ACTION_ITEMS[code];
  if (!builder) throw new Error(`ACTION_ITEMS_MISSING:${code}`);
  return builder(m);
}

export interface OperationalGenerationResult {
  drafts: OperationalDraft[];
  unmappedFindings: string[];
}

/**
 * Operational findings → validated drafts. `asOf` is injected so end-of-year
 * impact is deterministic under test rather than depending on the clock.
 */
export function generateOperationalRecommendations(
  findings: Finding[],
  asOf: Date = new Date(),
): OperationalGenerationResult {
  const drafts: OperationalDraft[] = [];
  const unmapped: string[] = [];

  for (const finding of findings) {
    const generator = OPERATIONAL_GENERATORS[finding.code];
    if (!generator) {
      unmapped.push(finding.code);
      continue;
    }
    const body = generator(finding, asOf);
    if (!body) continue;

    const acts = operationalActionItemsFor(finding.code, finding.metrics);
    if (acts.actionItems.length === 0 || acts.actionItemsHe.length === 0) {
      throw new Error(`ACTION_ITEMS_EMPTY:${finding.code}`);
    }
    const draft: OperationalDraft = { ...body, ...acts };

    RationaleSchema.parse(draft.rationale);
    RationaleSchema.parse(draft.rationaleHe);

    const validation = validateStrategyText([
      draft.title,
      draft.titleHe,
      draft.rationale.why,
      draft.rationale.expectedImpact,
      ...draft.rationale.benefits,
      ...draft.rationale.alternatives,
      ...draft.rationale.tradeoffs,
      draft.rationaleHe.why,
      draft.rationaleHe.expectedImpact,
      ...draft.rationaleHe.benefits,
      ...draft.rationaleHe.alternatives,
      ...draft.rationaleHe.tradeoffs,
      ...draft.actionItems,
      ...draft.actionItemsHe,
    ]);
    if (!validation.valid) {
      throw new Error(`PRODUCT_REFERENCE_IN_GENERATOR:${finding.code}:${validation.pattern}`);
    }
    drafts.push(draft);
  }

  return { drafts, unmappedFindings: [...new Set(unmapped)] };
}
