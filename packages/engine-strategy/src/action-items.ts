/**
 * M23c — concrete, computed action checklists per finding code (owner decision:
 * option A). Strategy-level ONLY: channels and wrappers, never products; every
 * string passes the product-reference validator. Amounts come from the finding's
 * own metrics, so steps are reproducible from the pinned snapshot.
 * A missing code THROWS — a new finding without action items is a bug.
 */

export interface ActionItems {
  actionItems: string[];
  actionItemsHe: string[];
}

type M = Record<string, number | string>;
const nis = (v: unknown): string => `₪${Math.round(Number(v)).toLocaleString("en-US")}`;

const BUILDERS: Record<string, (m: M) => ActionItems> = {
  LIQUIDITY_BELOW_TARGET: (m) => ({
    actionItems: [
      `Open/choose one liquid home for the buffer (bank deposit or money-market channel) and move toward ${m["targetMonths"]} months (${nis(Number(m["monthlyExpenses"]) * Number(m["targetMonths"]))}).`,
      `Set a monthly standing order until the gap closes; pause other new investing meanwhile.`,
      `Update the account value in Mapping when done and rerun strategy.`,
    ],
    actionItemsHe: [
      `בחרו בית נזיל אחד לכרית (פיקדון בנקאי או אפיק כספי) והשלימו ל-${m["targetMonths"]} חודשים (${nis(Number(m["monthlyExpenses"]) * Number(m["targetMonths"]))}).`,
      `קבעו הוראת קבע חודשית עד סגירת הפער; השהו בינתיים השקעות חדשות אחרות.`,
      `עדכנו את השווי במיפוי בסיום והריצו אסטרטגיה מחדש.`,
    ],
  }),
  EXCESS_IDLE_CASH: (m) => ({
    actionItems: [
      `Keep ${m["targetMonths"]} months of expenses in cash; everything above it is deployable.`,
      `Move the excess to your investment channels per the target allocation — gradually (e.g., over 3 monthly slices) if you prefer.`,
      `Prefer tax-advantaged wrappers with unused ceilings first (see tax recommendations).`,
    ],
    actionItemsHe: [
      `השאירו ${m["targetMonths"]} חודשי הוצאה במזומן; כל מה שמעבר — ניתן להשקעה.`,
      `העבירו את העודף לאפיקי ההשקעה לפי יעד ההקצאה — אפשר בהדרגה (למשל ב-3 מנות חודשיות).`,
      `העדיפו קודם עטיפות מוטבות-מס עם תקרות פנויות (ראו המלצות המס).`,
    ],
  }),
  CONCENTRATION_SINGLE_ASSET: (m) => ({
    actionItems: [
      `Target: bring "${m["itemName"]}" from ${m["sharePct"]}% below ${m["thresholdPct"]}% of assets.`,
      `Path A — staged sale: realize a slice each TAX YEAR (spreads capital-gains tax) and redeploy per the target allocation.`,
      `Path B — no sale: divert ALL new savings to other channels until the share falls below the threshold.`,
      `After each step: update values in Mapping and rerun strategy to re-measure.`,
    ],
    actionItemsHe: [
      `היעד: להוריד את "${m["itemName"]}" מ-${m["sharePct"]}% אל מתחת ל-${m["thresholdPct"]}% מהנכסים.`,
      `מסלול א' — מימוש מדורג: ממשו נתח בכל שנת מס (פורס את מס רווחי ההון) ופזרו לפי יעד ההקצאה.`,
      `מסלול ב' — ללא מכירה: נתבו את כל החיסכון החדש לאפיקים אחרים עד שהמשקל יורד מתחת לסף.`,
      `אחרי כל צעד: עדכנו שווי במיפוי והריצו אסטרטגיה מחדש למדידה עדכנית.`,
    ],
  }),
  CONCENTRATION_INSTITUTION: (m) => ({
    actionItems: [
      `Ask ${m["institution"]} for a fee quote citing your total balance — concentration is leverage.`,
      `If staying: document the decision in the journal. If spreading: move ONE wrapper type to another manager (same-type transfer, no tax event).`,
    ],
    actionItemsHe: [
      `בקשו מ${m["institution"]} הצעת דמי ניהול על בסיס סך הצבירה — הריכוזיות היא כוח מיקוח.`,
      `אם נשארים: תעדו את ההחלטה ביומן. אם מפזרים: ניידו סוג עטיפה אחד לגוף אחר (ניוד באותו סוג — ללא אירוע מס).`,
    ],
  }),
  CURRENCY_HOME_BIAS: (m) => ({
    actionItems: [
      `Raise foreign exposure toward ${m["minPct"]}% — inside existing wrappers first: switch part of the investment track to a global track (no tax event).`,
      `Alternatively direct new contributions to globally-oriented channels only.`,
    ],
    actionItemsHe: [
      `העלו את החשיפה הזרה לכיוון ${m["minPct"]}% — קודם בתוך העטיפות הקיימות: העבירו חלק מהמסלול למסלול גלובלי (ללא אירוע מס).`,
      `לחלופין נתבו הפקדות חדשות בלבד לאפיקים גלובליים.`,
    ],
  }),
  CURRENCY_FOREIGN_EXCESS: (m) => ({
    actionItems: [
      `Bring foreign exposure under ${m["maxPct"]}%: convert part of foreign-currency holdings to base-currency channels, or point all new savings to ILS channels.`,
      `Do conversions in slices rather than one day's rate.`,
    ],
    actionItemsHe: [
      `הורידו את החשיפה הזרה מתחת ל-${m["maxPct"]}%: המירו חלק מהיתרות במט"ח לאפיקים שקליים, או נתבו את כל החיסכון החדש לאפיקים שקליים.`,
      `בצעו המרות במנות ולא בשער של יום אחד.`,
    ],
  }),
  TAX_HISHTALMUT_MISSING: (m) => ({
    actionItems: [
      `Open a keren hishtalmut for ${m["memberName"]} at any managing body (employee: via employer; self-employed: directly).`,
      `Deposit up to the exempt ceiling (${nis(m["exemptCeilingAnnualILS"])}/year) before the tax year ends.`,
      `Map the new account in Mapping (type: keren hishtalmut) and set its growth share.`,
    ],
    actionItemsHe: [
      `פתחו קרן השתלמות עבור ${m["memberName"]} בכל גוף מנהל (שכיר/ה: דרך המעסיק; עצמאי/ת: ישירות).`,
      `הפקידו עד התקרה הפטורה (${nis(m["exemptCeilingAnnualILS"])} בשנה) לפני תום שנת המס.`,
      `מפו את החשבון החדש במיפוי (סוג: קרן השתלמות) והגדירו רכיב צמיחה.`,
    ],
  }),
  TAX_PENSION_MISSING: (m) => ({
    actionItems: [
      `Open a comprehensive pension fund for ${m["memberName"]} (employee: employer must contribute; self-employed: mandatory too).`,
      `Verify the embedded disability + survivor cover levels on joining.`,
      `Map it in Mapping with ownership assigned to ${m["memberName"]}.`,
    ],
    actionItemsHe: [
      `פתחו קרן פנסיה מקיפה עבור ${m["memberName"]} (שכיר/ה: המעסיק חייב להפריש; עצמאי/ת: חובה גם כן).`,
      `בהצטרפות ודאו את רמות הכיסוי המובנה לאובדן כושר עבודה ושארים.`,
      `מפו אותה במיפוי עם בעלות על שם ${m["memberName"]}.`,
    ],
  }),
  HIGH_MANAGEMENT_FEE: (m) => ({
    actionItems: [
      `Call the manager of "${m["itemName"]}": ask to reduce the ${m["feePct"]}% fee, citing competing offers.`,
      `No movement within 2 weeks → transfer to a cheaper manager of the SAME product type (rights preserved, no tax event).`,
      `Update the fee in Mapping so the engine re-measures.`,
    ],
    actionItemsHe: [
      `התקשרו לגוף המנהל של "${m["itemName"]}": בקשו הוזלה של ה-${m["feePct"]}% תוך ציון הצעות מתחרות.`,
      `אין תזוזה תוך שבועיים → ניידו לגוף זול יותר מאותו סוג מוצר (הזכויות נשמרות, ללא אירוע מס).`,
      `עדכנו את דמי הניהול במיפוי כדי שהמנוע ימדוד מחדש.`,
    ],
  }),
  MORTGAGE_CPI_CONCENTRATION: (m) => ({
    actionItems: [
      `Ask your bank + one competitor for a refinance quote moving part of the CPI-linked ${m["cpiSharePct"]}% to unlinked tracks.`,
      `Compare total remaining cost incl. early-repayment fees, not just the monthly payment.`,
      `If refinancing: update the tracks in Mapping afterwards.`,
    ],
    actionItemsHe: [
      `בקשו מהבנק שלכם + מתחרה אחד הצעת מיחזור שמעבירה חלק מהרכיב הצמוד (${m["cpiSharePct"]}%) למסלולים לא-צמודים.`,
      `השוו עלות כוללת נותרת כולל עמלות פירעון מוקדם — לא רק החזר חודשי.`,
      `אם מיחזרתם: עדכנו את המסלולים במיפוי.`,
    ],
  }),
  MORTGAGE_EXPENSIVE_TRACK: (m) => ({
    actionItems: [
      `Get the early-repayment fee quote for the ${m["maxRatePct"]}% track from the bank (free, no commitment).`,
      `If the fee is small relative to remaining interest: repay early from liquid surplus (NOT from the emergency buffer).`,
      `Otherwise ask to refinance that track specifically.`,
    ],
    actionItemsHe: [
      `בקשו מהבנק דוח עמלת פירעון מוקדם למסלול ה-${m["maxRatePct"]}% (חינם, ללא התחייבות).`,
      `אם העמלה קטנה ביחס לריבית שנותרה: פרעו מוקדם מעודף נזיל (לא מכרית החירום).`,
      `אחרת בקשו למחזר את המסלול הזה ספציפית.`,
    ],
  }),
  ALLOCATION_GROWTH_BELOW_TARGET: (m) => ({
    actionItems: [
      `Shift ~${nis(m["shiftBase"])} from defensive to growth channels to close the ${m["gapPct"]}-point gap.`,
      `Order: 1) switch tracks INSIDE pension/hishtalmut/gemel (no tax event); 2) then taxable accounts if still short.`,
      `Or the slow path: point ALL new savings at growth channels and re-measure quarterly.`,
    ],
    actionItemsHe: [
      `העבירו כ-${nis(m["shiftBase"])} מאפיקים סולידיים לאפיקי צמיחה לסגירת פער של ${m["gapPct"]} נק'.`,
      `סדר פעולה: 1) שינוי מסלול בתוך פנסיה/השתלמות/גמל (ללא אירוע מס); 2) חשבונות חייבים רק אם עוד חסר.`,
      `או המסלול האיטי: נתבו את כל החיסכון החדש לאפיקי צמיחה ומדדו מחדש רבעונית.`,
    ],
  }),
  ALLOCATION_GROWTH_ABOVE_TARGET: (m) => ({
    actionItems: [
      `Shift ~${nis(m["shiftBase"])} from growth to defensive channels (${m["gapPct"]} points above target).`,
      `Order: 1) track changes inside wrappers (no tax event); 2) in taxable accounts prefer selling recent lots / spreading across tax years.`,
    ],
    actionItemsHe: [
      `העבירו כ-${nis(m["shiftBase"])} מאפיקי צמיחה לאפיקים סולידיים (${m["gapPct"]} נק' מעל היעד).`,
      `סדר פעולה: 1) שינוי מסלול בתוך העטיפות (ללא אירוע מס); 2) בחשבונות חייבים העדיפו פריסה בין שנות מס.`,
    ],
  }),
  ALLOCATION_MIX_UNKNOWN: (m) => ({
    actionItems: [
      `Open the latest statement of each listed account (${m["itemNames"]}) and find the track's asset composition.`,
      `Enter the growth share % in Mapping → Edit for each; or click the auto-suggest button and confirm.`,
      `Rerun strategy — the allocation comparison unlocks/sharpens.`,
    ],
    actionItemsHe: [
      `פתחו את הדוח האחרון של כל חשבון ברשימה (${m["itemNames"]}) ומצאו את הרכב הנכסים של המסלול.`,
      `הזינו רכיב צמיחה % במיפוי ← עריכה לכל אחד; או לחצו על ההצעה האוטומטית ואשרו.`,
      `הריצו אסטרטגיה מחדש — השוואת ההקצאה תיפתח/תתחדד.`,
    ],
  }),
  ALLOCATION_MIX_ESTIMATED: (m) => ({
    actionItems: [
      `In Mapping, click "confirm" on each amber estimate badge (${m["itemNames"]}) — or correct the number from the statement first.`,
    ],
    actionItemsHe: [
      `במיפוי, לחצו "אישור" על כל תג אומדן כתום (${m["itemNames"]}) — או תקנו קודם את המספר מהדוח.`,
    ],
  }),
  ALLOCATION_REAL_ESTATE_HIGH: (m) => ({
    actionItems: [
      `No selling required: direct ALL new savings to financial channels until the property share (${m["reSharePct"]}%) trends toward ${m["thresholdPct"]}%.`,
      `If you accept the concentration deliberately — record the decision in the journal and raise the threshold assumption.`,
    ],
    actionItemsHe: [
      `אין צורך למכור: נתבו את כל החיסכון החדש לאפיקים פיננסיים עד שמשקל הנדל"ן (${m["reSharePct"]}%) יורד לכיוון ${m["thresholdPct"]}%.`,
      `אם אתם מקבלים את הריכוזיות במודע — תעדו ביומן והעלו את הנחת הסף.`,
    ],
  }),
  INSURANCE_SURVIVOR_GAP: (m) => ({
    actionItems: [
      `Get life-cover quotes for ${m["memberName"]} for the shortfall (${nis(Number(m["requiredBase"]) - Number(m["coverageBase"]))}) — term life ("risk") is the simple instrument.`,
      `Check first what survivor pension the pension fund already provides — it reduces the needed amount.`,
      `Map the new policy in Mapping → Insurance so the engine re-measures.`,
    ],
    actionItemsHe: [
      `בקשו הצעות לביטוח חיים עבור ${m["memberName"]} על הפער (${nis(Number(m["requiredBase"]) - Number(m["coverageBase"]))}) — ביטוח "ריסק" הוא הכלי הפשוט.`,
      `בדקו קודם איזו קצבת שארים קרן הפנסיה כבר מקנה — היא מקטינה את הסכום הנדרש.`,
      `מפו את הפוליסה החדשה במיפוי ← ביטוח כדי שהמנוע ימדוד מחדש.`,
    ],
  }),
  INSURANCE_DISABILITY_MISSING: (m) => ({
    actionItems: [
      `Simplest: open/verify a comprehensive pension for ${m["memberName"]} — disability cover is embedded.`,
      `If pension exists elsewhere: map it with ${m["memberName"]}'s ownership; otherwise map a standalone disability policy if one exists.`,
    ],
    actionItemsHe: [
      `הפשוט ביותר: פתחו/ודאו קרן פנסיה מקיפה עבור ${m["memberName"]} — כיסוי אובדן כושר עבודה מובנה בה.`,
      `אם קיימת פנסיה שלא מופתה: מפו אותה עם בעלות של ${m["memberName"]}; אחרת מפו פוליסת א.כ.ע עצמאית אם קיימת.`,
    ],
  }),
  INSURANCE_MORTGAGE_LIFE_GAP: (m) => ({
    actionItems: [
      `Ask your current insurer to raise mortgage-life cover by ${nis(m["shortfallBase"])} (to match the outstanding ${nis(m["outstandingBase"])}), and get one competing quote.`,
      `Map/update the policy in Mapping afterwards.`,
    ],
    actionItemsHe: [
      `בקשו מהמבטח הנוכחי להגדיל את ביטוח החיים למשכנתא ב-${nis(m["shortfallBase"])} (להתאמה ליתרה ${nis(m["outstandingBase"])}), וקחו הצעה מתחרה אחת.`,
      `עדכנו/מפו את הפוליסה במיפוי לאחר מכן.`,
    ],
  }),
  TAX_HISHTALMUT_UNDERUTILIZED: (m) => ({
    actionItems: [
      `Deposit the unused ${nis(m["unusedBase"])} to ${m["memberName"]}'s hishtalmut before the tax year ends (${m["monthsRemaining"]} months left).`,
      `Map the deposit as a contribution flow so utilization tracking stays current.`,
    ],
    actionItemsHe: [
      `הפקידו את היתרה הפנויה ${nis(m["unusedBase"])} לקרן ההשתלמות של ${m["memberName"]} לפני תום שנת המס (נותרו ${m["monthsRemaining"]} חודשים).`,
      `מפו את ההפקדה כתזרים הפקדה כדי שמעקב המיצוי יישאר עדכני.`,
    ],
  }),
  TAX_PENSION_UNDERUTILIZED: (m) => ({
    actionItems: [
      `Deposit up to ${nis(m["unusedBase"])} more to ${m["memberName"]}'s pension this tax year to capture the remaining deduction/credit (${m["monthsRemaining"]} months left).`,
      `Self-employed: a year-end lump sum works; employees: ask payroll about section-46 supplemental deposits.`,
    ],
    actionItemsHe: [
      `הפקידו עוד עד ${nis(m["unusedBase"])} לפנסיה של ${m["memberName"]} בשנת המס הנוכחית למיצוי יתרת הניכוי/הזיכוי (נותרו ${m["monthsRemaining"]} חודשים).`,
      `עצמאים: הפקדה חד-פעמית בסוף שנה עובדת; שכירים: בררו מול השכר על הפקדה משלימה (סעיף 46).`,
    ],
  }),
  MORTGAGE_ABOVE_BENCHMARK: (m) => ({
    actionItems: [
      `Your ${m["trackType"]} track on "${m["itemName"]}" costs ${m["trackRatePct"]}% vs a live benchmark of ${m["benchmarkPct"]}% — ask the bank to reprice, citing the gap (${m["excessPct"]} points).`,
      `Bring one competing refinance quote to the meeting; banks move when you can walk.`,
      `Update the track rate in Mapping after any change.`,
    ],
    actionItemsHe: [
      `מסלול ה-${m["trackType"]} על "${m["itemName"]}" עולה ${m["trackRatePct"]}% מול בנצ'מרק חי של ${m["benchmarkPct"]}% — בקשו מהבנק תמחור מחדש תוך ציון הפער (${m["excessPct"]} נק').`,
      `הביאו לפגישה הצעת מיחזור מתחרה אחת; בנקים זזים כשאפשר ללכת.`,
      `עדכנו את ריבית המסלול במיפוי אחרי כל שינוי.`,
    ],
  }),
};

export function actionItemsFor(code: string, metrics: M): ActionItems {
  const builder = BUILDERS[code];
  if (!builder) throw new Error(`ACTION_ITEMS_MISSING:${code}`);
  return builder(metrics);
}
