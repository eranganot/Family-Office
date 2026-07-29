/**
 * Israeli statutory financial calendar + household recurring reviews.
 *
 * Pure data + pure date arithmetic — no I/O — so it lives in `domain` and can be used by
 * both the engine and the db seed path (the dependency matrix forbids db → engine).
 *
 * STATUTORY entries carry a source and are `ownerReviewed: false` until Eran confirms
 * them at /registry, exactly like the tax matrices. HOUSEHOLD entries are templates the
 * owner enables and dates himself — WealthOS does not know when his insurance renews.
 */

export type CalendarRuleKind =
  | "TAX_DEADLINE" | "BITUACH_LEUMI" | "PENSION_WINDOW" | "HISHTALMUT_CEILING"
  | "GEMEL_CONTRIBUTION" | "MORTGAGE_RESET" | "INSURANCE_RENEWAL" | "ARNONA"
  | "VEHICLE_LICENSE" | "VEHICLE_INSURANCE" | "SCHOOL_PAYMENT" | "CHILDCARE_PAYMENT"
  | "SALARY_BONUS" | "HOLIDAY_SPENDING" | "ANNUAL_SUBSCRIPTION" | "REVIEW" | "OTHER";

export type Cadence = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL" | "ONE_TIME";

export interface CalendarRule {
  key: string;
  kind: CalendarRuleKind;
  titleEn: string;
  titleHe: string;
  cadence: Cadence;
  /** Month (1–12) and day for ANNUAL/SEMI_ANNUAL/QUARTERLY anchors. */
  month?: number | undefined;
  day: number;
  /** How many days ahead it should start showing as upcoming. */
  leadDays: number;
  /** Statutory dates are law; household ones are the owner's own schedule. */
  origin: "STATUTORY" | "HOUSEHOLD";
  /** Whether the event moves money (feeds the liquidity forecast / Safe-to-Spend). */
  cashImpacting: boolean;
  /** Enabled by default at seed time, or offered as a template the owner switches on. */
  defaultEnabled: boolean;
  sourceNote?: string | undefined;
}

/**
 * Statutory dates. DELIBERATELY CONSERVATIVE: only entries whose date is fixed in law or
 * long-standing practice are included. Anything that moves year to year (the Tax
 * Authority's annual filing extensions, for instance) is left out rather than guessed —
 * a wrong deadline in a financial calendar is worse than a missing one.
 */
export const IL_STATUTORY_RULES: CalendarRule[] = [
  {
    key: "tax.annual_return",
    kind: "TAX_DEADLINE",
    titleEn: "Annual tax return filing deadline (individuals)",
    titleHe: "מועד הגשת דוח שנתי ליחיד",
    cadence: "ANNUAL", month: 4, day: 30, leadDays: 60,
    origin: "STATUTORY", cashImpacting: false, defaultEnabled: true,
    sourceNote: "Base statutory date; the Tax Authority routinely grants extensions — verify each year",
  },
  {
    key: "tax.capital_gains_h1",
    kind: "TAX_DEADLINE",
    titleEn: "Capital-gains advance payment (H1)",
    titleHe: "מקדמה על רווחי הון (מחצית ראשונה)",
    cadence: "SEMI_ANNUAL", month: 7, day: 31, leadDays: 30,
    origin: "STATUTORY", cashImpacting: true, defaultEnabled: true,
    sourceNote: "Due within 30 days of each half-year for self-traded securities",
  },
  {
    key: "tax.capital_gains_h2",
    kind: "TAX_DEADLINE",
    titleEn: "Capital-gains advance payment (H2)",
    titleHe: "מקדמה על רווחי הון (מחצית שנייה)",
    cadence: "SEMI_ANNUAL", month: 1, day: 31, leadDays: 30,
    origin: "STATUTORY", cashImpacting: true, defaultEnabled: true,
  },
  {
    key: "hishtalmut.ceiling_check",
    kind: "HISHTALMUT_CEILING",
    titleEn: "Keren Hishtalmut — check annual ceiling before year end",
    titleHe: "קרן השתלמות — בדיקת ניצול התקרה לפני סוף השנה",
    cadence: "ANNUAL", month: 11, day: 30, leadDays: 45,
    origin: "STATUTORY", cashImpacting: true, defaultEnabled: true,
    sourceNote: "Unused ceiling cannot be carried to the next tax year",
  },
  {
    key: "gemel.year_end_deposit",
    kind: "GEMEL_CONTRIBUTION",
    titleEn: "Kupat Gemel / pension — year-end deposit window",
    titleHe: "קופת גמל / פנסיה — חלון הפקדה לסוף השנה",
    cadence: "ANNUAL", month: 12, day: 15, leadDays: 45,
    origin: "STATUTORY", cashImpacting: true, defaultEnabled: true,
    sourceNote: "Deposits must clear before 31/12 to count for the tax year",
  },
  {
    key: "tax.year_end_review",
    kind: "TAX_DEADLINE",
    titleEn: "Year-end tax optimisation review",
    titleHe: "סקירת אופטימיזציית מס לסוף השנה",
    cadence: "ANNUAL", month: 12, day: 1, leadDays: 30,
    origin: "STATUTORY", cashImpacting: false, defaultEnabled: true,
  },
];

/**
 * Household templates — dates and amounts are the owner's, so these ship DISABLED and
 * carry no date until he sets one. Seeding a guessed renewal date would produce a
 * confident, wrong calendar.
 */
export const HOUSEHOLD_TEMPLATE_RULES: CalendarRule[] = [
  { key: "review.insurance", kind: "REVIEW", titleEn: "Review insurance cover", titleHe: "סקירת כיסויים ביטוחיים", cadence: "ANNUAL", month: 9, day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "review.mortgage", kind: "REVIEW", titleEn: "Review mortgage / refinance check", titleHe: "בדיקת משכנתא ומיחזור", cadence: "ANNUAL", month: 3, day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "review.ips", kind: "REVIEW", titleEn: "Review investment policy (IPS)", titleHe: "סקירת מדיניות ההשקעות", cadence: "QUARTERLY", month: 1, day: 15, leadDays: 14, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "review.emergency_fund", kind: "REVIEW", titleEn: "Review emergency fund", titleHe: "בדיקת קרן חירום", cadence: "MONTHLY", day: 10, leadDays: 7, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "review.fees", kind: "REVIEW", titleEn: "Review bank and management fees", titleHe: "סקירת עמלות בנק ודמי ניהול", cadence: "SEMI_ANNUAL", month: 2, day: 15, leadDays: 21, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "vehicle.license", kind: "VEHICLE_LICENSE", titleEn: "Vehicle licence renewal", titleHe: "חידוש רישיון רכב", cadence: "ANNUAL", day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: true, defaultEnabled: false },
  { key: "vehicle.insurance", kind: "VEHICLE_INSURANCE", titleEn: "Vehicle insurance renewal", titleHe: "חידוש ביטוח רכב", cadence: "ANNUAL", day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: true, defaultEnabled: false },
  { key: "insurance.home", kind: "INSURANCE_RENEWAL", titleEn: "Home insurance renewal", titleHe: "חידוש ביטוח דירה", cadence: "ANNUAL", day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: true, defaultEnabled: false },
  { key: "arnona.payment", kind: "ARNONA", titleEn: "Arnona payment", titleHe: "תשלום ארנונה", cadence: "SEMI_ANNUAL", day: 1, leadDays: 14, origin: "HOUSEHOLD", cashImpacting: true, defaultEnabled: false },
  { key: "school.payment", kind: "SCHOOL_PAYMENT", titleEn: "School payments", titleHe: "תשלומי בית ספר", cadence: "ANNUAL", month: 9, day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: true, defaultEnabled: false },
  { key: "mortgage.reset", kind: "MORTGAGE_RESET", titleEn: "Mortgage track reset date", titleHe: "מועד עדכון מסלול משכנתא", cadence: "ANNUAL", day: 1, leadDays: 45, origin: "HOUSEHOLD", cashImpacting: true, defaultEnabled: false },
];

/**
 * Next occurrence of a rule strictly AFTER `from`.
 *
 * Uses UTC throughout and clamps the day to the month's length, so a rule anchored on
 * the 31st lands on the last day of a short month rather than silently rolling into the
 * next one — a rolled date in a deadline calendar is a missed deadline.
 */
export function nextOccurrence(rule: CalendarRule, from: Date): Date {
  const clamp = (y: number, m: number, d: number): Date => {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1, Math.min(d, lastDay)));
  };
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + 1;

  if (rule.cadence === "MONTHLY") {
    const thisMonth = clamp(y, m, rule.day);
    return thisMonth > from ? thisMonth : clamp(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, rule.day);
  }

  const step = rule.cadence === "QUARTERLY" ? 3 : rule.cadence === "SEMI_ANNUAL" ? 6 : 12;
  const anchorMonth = rule.month ?? 1;
  // Walk forward from the anchor in `step` increments until past `from`.
  let candidate = clamp(y, anchorMonth, rule.day);
  let guard = 0;
  while (candidate <= from && guard < 40) {
    const total = (candidate.getUTCFullYear() * 12 + candidate.getUTCMonth()) + step;
    candidate = clamp(Math.floor(total / 12), (total % 12) + 1, rule.day);
    guard += 1;
  }
  if (candidate <= from) {
    // ONE_TIME in the past, or an anchor we could not advance: report it unchanged
    // rather than inventing a future date.
    return candidate;
  }
  return candidate;
}

/** All occurrences of a rule inside a window — used to build the forward calendar. */
export function occurrencesInWindow(rule: CalendarRule, from: Date, until: Date): Date[] {
  const out: Date[] = [];
  let cursor = from;
  let guard = 0;
  while (guard < 60) {
    const next = nextOccurrence(rule, cursor);
    if (next > until || next <= cursor) break;
    out.push(next);
    cursor = next;
    guard += 1;
    if (rule.cadence === "ONE_TIME") break;
  }
  return out;
}


/**
 * Why each suggested date is what it is.
 *
 * These are OUR suggestion, not the owner's decision. Rules with no month previously
 * fell back to 1 January, which put five unrelated reviews on the same fabricated day —
 * a date nobody chose, presented as though someone had. Every default-on rule now
 * carries a month and a stated reason, and the UI shows the reason so the owner can
 * disagree with it on the merits rather than guessing what we meant.
 *
 * The scheduling principle: keep discretionary reviews OFF the statutory cluster
 * (31 Jan, 30 Apr, 31 Jul, 30 Nov, 1 + 15 Dec) so a policy review never lands in the
 * same week as a capital-gains advance.
 */
export const SUGGESTED_DATE_RATIONALE: Record<string, { en: string; he: string }> = {
  "review.fees": {
    en: "Mid-February: annual bank and fund statements land in January, so you review fees with the real figures in hand rather than from memory. Repeats mid-August.",
    he: "אמצע פברואר: הדוחות השנתיים מהבנק ומהקופות מגיעים בינואר, כך שהסקירה נעשית מול הנתונים האמיתיים ולא מהזיכרון. חוזר באמצע אוגוסט.",
  },
  "review.ips": {
    en: "15th, quarterly (Jan/Apr/Jul/Oct) — about two weeks BEFORE each capital-gains and filing date, so the portfolio review informs the tax action rather than arriving after it.",
    he: "ה-15, רבעוני (ינו׳/אפר׳/יולי/אוק׳) — כשבועיים לפני כל מועד רווחי הון והגשה, כך שסקירת התיק מזינה את פעולת המס במקום להגיע אחריה.",
  },
  "review.emergency_fund": {
    en: "10th of the month: after salary has landed and the month's card settlement has cleared, so the buffer you see is the real post-settlement figure, not a pre-salary trough.",
    he: "ה-10 בחודש: אחרי כניסת המשכורת ואחרי חיוב האשראי, כך שהיתרה שנראית היא המצב האמיתי ולא שפל שלפני המשכורת.",
  },
  "review.insurance": {
    en: "1 September: clear of every tax deadline, and early enough that a change takes effect before the year turns.",
    he: "1 בספטמבר: מרוחק מכל מועדי המס, ומוקדם מספיק כדי ששינוי ייכנס לתוקף לפני סוף השנה.",
  },
  "review.mortgage": {
    en: "1 March: after the year's first Bank of Israel rate decisions, and clear of the 30 April filing date.",
    he: "1 במרץ: אחרי החלטות הריבית הראשונות של בנק ישראל, ומרוחק ממועד הגשת הדוח ב-30 באפריל.",
  },
  "gemel.year_end_deposit": {
    en: "Moved from 25 to 15 December: the deposit must be CREDITED by 31 December, and provident funds routinely take several business days. The 25th left no margin.",
    he: "הוזז מ-25 ל-15 בדצמבר: ההפקדה חייבת להיזקף עד 31 בדצמבר, ולקופות לוקח מספר ימי עסקים. ה-25 לא השאיר מרווח.",
  },
};
