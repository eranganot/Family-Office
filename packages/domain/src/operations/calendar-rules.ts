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
    cadence: "ANNUAL", month: 12, day: 25, leadDays: 45,
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
  { key: "review.insurance", kind: "REVIEW", titleEn: "Review insurance cover", titleHe: "סקירת כיסויים ביטוחיים", cadence: "ANNUAL", day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "review.mortgage", kind: "REVIEW", titleEn: "Review mortgage / refinance check", titleHe: "בדיקת משכנתא ומיחזור", cadence: "ANNUAL", day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "review.ips", kind: "REVIEW", titleEn: "Review investment policy (IPS)", titleHe: "סקירת מדיניות ההשקעות", cadence: "QUARTERLY", day: 1, leadDays: 14, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "review.emergency_fund", kind: "REVIEW", titleEn: "Review emergency fund", titleHe: "בדיקת קרן חירום", cadence: "MONTHLY", day: 1, leadDays: 7, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
  { key: "review.fees", kind: "REVIEW", titleEn: "Review bank and management fees", titleHe: "סקירת עמלות בנק ודמי ניהול", cadence: "SEMI_ANNUAL", day: 1, leadDays: 21, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true },
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
