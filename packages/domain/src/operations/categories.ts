/**
 * Category-tree taxonomy lives in `domain` (not in the engine) because BOTH the
 * engine and the db seed path need it, and `db` may import only `domain` under the
 * dependency matrix. It is pure data + a pure flatten function — no I/O, no engine
 * logic — so it belongs here on merit, not just for boundary convenience.
 */
export type BehavioralClassKey =
  | "FIXED_CONTRACTUAL"
  | "VARIABLE_DISCRETIONARY"
  | "FINANCIAL_DRAG"
  | "SAVINGS_FLOW"
  | "TRANSFER";

export type CategoryAxisKey = "INCOME" | "EXPENSE";

/**
 * The default functional category tree (axis 1). Seeded per household, then fully
 * editable — `isSystem` rows can be re-parented, renamed or archived, never deleted.
 *
 * The IL-specific leaves (Arnona, Bituach Leumi, Kupat Gemel, Hishtalmut, Vehicle
 * licence/test) and the leaf granularity under Food/Transport/Subscriptions were
 * chosen to match the categories that actually occur in the owner's real bank and
 * card statements (docs/architecture/07 Appendix B) — so the tree fits on day one
 * rather than needing a manual build-out before the first import is useful.
 *
 * `mapsToFlowType` is the bridge to the canonical `CashFlowDetail` stream model:
 * it lets an aggregated category roll up into the CashFlowType the strategy engine
 * already understands, which is what keeps Operations and Ledger reconcilable.
 */
export interface SeedCategory {
  key: string;
  nameEn: string;
  nameHe: string;
  axis: CategoryAxisKey;
  behavioral: BehavioralClassKey;
  /** Prisma CashFlowType name, or null when the category has no stream equivalent. */
  mapsToFlowType?: string | null | undefined;
  children?: SeedCategory[] | undefined;
}

const inc = (
  key: string, nameEn: string, nameHe: string, behavioral: BehavioralClassKey,
  mapsToFlowType: string | null = null, children?: SeedCategory[],
): SeedCategory => ({ key, nameEn, nameHe, axis: "INCOME", behavioral, mapsToFlowType, children });

const exp = (
  key: string, nameEn: string, nameHe: string, behavioral: BehavioralClassKey,
  mapsToFlowType: string | null = null, children?: SeedCategory[],
): SeedCategory => ({ key, nameEn, nameHe, axis: "EXPENSE", behavioral, mapsToFlowType, children });

export const DEFAULT_CATEGORY_TREE: SeedCategory[] = [
  // ---------------------------------------------------------------- INCOME --
  inc("income.salary", "Salary", "משכורת", "FIXED_CONTRACTUAL", "SALARY", [
    inc("income.salary.base", "Base salary", "שכר בסיס", "FIXED_CONTRACTUAL", "SALARY"),
    inc("income.salary.bonus", "Bonus", "בונוס", "VARIABLE_DISCRETIONARY", "SALARY"),
    inc("income.salary.rsu", "RSUs / equity", "מניות ו-RSU", "VARIABLE_DISCRETIONARY", "OTHER_INCOME"),
    inc("income.salary.reimbursement", "Expense reimbursement", "החזר הוצאות", "VARIABLE_DISCRETIONARY", "OTHER_INCOME"),
  ]),
  inc("income.self_employment", "Self-employment", "הכנסה מעסק", "VARIABLE_DISCRETIONARY", "SELF_EMPLOYMENT_INCOME"),
  inc("income.rental", "Rental income", "הכנסה משכירות", "FIXED_CONTRACTUAL", "RENTAL_INCOME"),
  inc("income.investment", "Investment income", "הכנסה מהשקעות", "VARIABLE_DISCRETIONARY", "OTHER_INCOME", [
    inc("income.investment.dividends", "Dividends", "דיבידנדים", "VARIABLE_DISCRETIONARY", "OTHER_INCOME"),
    inc("income.investment.interest", "Interest", "ריבית", "VARIABLE_DISCRETIONARY", "OTHER_INCOME"),
  ]),
  inc("income.pension", "Pension income", "הכנסה מפנסיה", "FIXED_CONTRACTUAL", "PENSION_INCOME"),
  inc("income.government", "Government benefits", "קצבאות והטבות", "FIXED_CONTRACTUAL", "OTHER_INCOME", [
    inc("income.government.child_allowance", "Child allowance", "קצבת ילדים", "FIXED_CONTRACTUAL", "OTHER_INCOME"),
    inc("income.government.other", "Other benefit", "קצבה אחרת", "FIXED_CONTRACTUAL", "OTHER_INCOME"),
  ]),
  inc("income.other", "Other income", "הכנסה אחרת", "VARIABLE_DISCRETIONARY", "OTHER_INCOME"),

  // --------------------------------------------------------------- EXPENSE --
  exp("housing", "Housing", "דיור", "FIXED_CONTRACTUAL", "HOUSING_EXPENSE", [
    exp("housing.mortgage", "Mortgage", "משכנתא", "FIXED_CONTRACTUAL", "LOAN_PAYMENT"),
    exp("housing.rent", "Rent", "שכר דירה", "FIXED_CONTRACTUAL", "HOUSING_EXPENSE"),
    exp("housing.arnona", "Arnona (municipal tax)", "ארנונה", "FIXED_CONTRACTUAL", "HOUSING_EXPENSE"),
    exp("housing.electricity", "Electricity", "חשמל", "FIXED_CONTRACTUAL", "HOUSING_EXPENSE"),
    exp("housing.water", "Water", "מים", "FIXED_CONTRACTUAL", "HOUSING_EXPENSE"),
    exp("housing.gas", "Gas", "גז", "FIXED_CONTRACTUAL", "HOUSING_EXPENSE"),
    exp("housing.internet_tv", "Internet / TV / phone", "אינטרנט, טלוויזיה וטלפון", "FIXED_CONTRACTUAL", "HOUSING_EXPENSE"),
    exp("housing.vaad_bayit", "Building committee", "ועד בית", "FIXED_CONTRACTUAL", "HOUSING_EXPENSE"),
    exp("housing.home_insurance", "Home insurance", "ביטוח דירה", "FIXED_CONTRACTUAL", "INSURANCE_PREMIUM"),
    exp("housing.maintenance", "Maintenance & repairs", "תחזוקה ותיקונים", "VARIABLE_DISCRETIONARY", "HOUSING_EXPENSE"),
  ]),
  exp("transport", "Transportation", "תחבורה", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE", [
    exp("transport.fuel", "Fuel", "דלק", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("transport.public", "Public transport", "תחבורה ציבורית", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("transport.parking", "Parking & tolls", "חניה וכבישי אגרה", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("transport.vehicle_insurance", "Vehicle insurance", "ביטוח רכב", "FIXED_CONTRACTUAL", "INSURANCE_PREMIUM"),
    exp("transport.vehicle_licence", "Vehicle licence & test", "רישוי וטסט", "FIXED_CONTRACTUAL", "LIVING_EXPENSE"),
    exp("transport.vehicle_service", "Service & repairs", "טיפולים ותיקונים", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("transport.leasing", "Leasing / car payment", "ליסינג ותשלומי רכב", "FIXED_CONTRACTUAL", "LOAN_PAYMENT"),
    exp("transport.taxi_micro", "Taxi & micromobility", "מוניות ושיתופי נסיעה", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
  ]),
  exp("food", "Food", "מזון", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE", [
    exp("food.groceries", "Groceries", "סופרמרקט", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("food.restaurants", "Restaurants", "מסעדות", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("food.coffee", "Coffee", "בתי קפה", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("food.delivery", "Delivery", "משלוחים", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
  ]),
  exp("utilities", "Utilities & services", "שירותים", "FIXED_CONTRACTUAL", "LIVING_EXPENSE", [
    exp("utilities.mobile", "Mobile", "סלולר", "FIXED_CONTRACTUAL", "LIVING_EXPENSE"),
    exp("utilities.subscriptions", "Subscriptions", "מנויים דיגיטליים", "FIXED_CONTRACTUAL", "LIVING_EXPENSE"),
    exp("utilities.cloud_software", "Cloud & software", "תוכנה וענן", "FIXED_CONTRACTUAL", "LIVING_EXPENSE"),
  ]),
  exp("insurance", "Insurance", "ביטוח", "FIXED_CONTRACTUAL", "INSURANCE_PREMIUM", [
    exp("insurance.life", "Life insurance", "ביטוח חיים", "FIXED_CONTRACTUAL", "INSURANCE_PREMIUM"),
    exp("insurance.health", "Health insurance", "ביטוח בריאות", "FIXED_CONTRACTUAL", "INSURANCE_PREMIUM"),
    exp("insurance.disability", "Disability / work capacity", "אובדן כושר עבודה", "FIXED_CONTRACTUAL", "INSURANCE_PREMIUM"),
    exp("insurance.long_term_care", "Long-term care", "סיעודי", "FIXED_CONTRACTUAL", "INSURANCE_PREMIUM"),
  ]),
  exp("healthcare", "Healthcare", "בריאות", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE", [
    exp("healthcare.kupat_holim", "Health fund", "קופת חולים", "FIXED_CONTRACTUAL", "LIVING_EXPENSE"),
    exp("healthcare.dental", "Dental", "טיפולי שיניים", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("healthcare.pharmacy", "Pharmacy", "בית מרקחת", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("healthcare.private", "Private treatment", "טיפולים פרטיים", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
  ]),
  exp("education", "Education", "חינוך", "FIXED_CONTRACTUAL", "EDUCATION_EXPENSE", [
    exp("education.school", "School payments", "תשלומי בית ספר", "FIXED_CONTRACTUAL", "EDUCATION_EXPENSE"),
    exp("education.tuition", "Tuition", "שכר לימוד", "FIXED_CONTRACTUAL", "EDUCATION_EXPENSE"),
    exp("education.activities", "Activities & classes", "חוגים", "VARIABLE_DISCRETIONARY", "EDUCATION_EXPENSE"),
    exp("education.supplies", "Books & supplies", "ספרים וציוד", "VARIABLE_DISCRETIONARY", "EDUCATION_EXPENSE"),
  ]),
  exp("childcare", "Childcare", "טיפול בילדים", "FIXED_CONTRACTUAL", "EDUCATION_EXPENSE", [
    exp("childcare.daycare", "Daycare / kindergarten", "מעון וגן", "FIXED_CONTRACTUAL", "EDUCATION_EXPENSE"),
    exp("childcare.babysitting", "Babysitting", "בייביסיטר", "VARIABLE_DISCRETIONARY", "EDUCATION_EXPENSE"),
  ]),
  exp("entertainment", "Entertainment", "פנאי ובידור", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE", [
    exp("entertainment.culture", "Culture & events", "תרבות ואירועים", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("entertainment.sport", "Sport & gym", "ספורט וכושר", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("entertainment.hobbies", "Hobbies", "תחביבים", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
  ]),
  exp("shopping", "Shopping", "קניות", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE", [
    exp("shopping.clothing", "Clothing", "ביגוד והנעלה", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("shopping.home", "Home & furniture", "בית וריהוט", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("shopping.electronics", "Electronics", "אלקטרוניקה", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("shopping.online", "Online / marketplaces", "קניות מקוונות", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("shopping.gifts", "Gifts", "מתנות", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
  ]),
  exp("travel", "Travel", "נסיעות וחופשות", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE", [
    exp("travel.flights", "Flights", "טיסות", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("travel.accommodation", "Accommodation", "לינה", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
    exp("travel.abroad", "Spending abroad", "הוצאות בחו״ל", "VARIABLE_DISCRETIONARY", "LIVING_EXPENSE"),
  ]),
  exp("taxes", "Taxes & statutory", "מסים וחובות סטטוטוריים", "FIXED_CONTRACTUAL", "OTHER_EXPENSE", [
    exp("taxes.income_tax", "Income tax", "מס הכנסה", "FIXED_CONTRACTUAL", "OTHER_EXPENSE"),
    exp("taxes.bituach_leumi", "National insurance", "ביטוח לאומי", "FIXED_CONTRACTUAL", "OTHER_EXPENSE"),
    exp("taxes.capital_gains", "Capital gains tax", "מס רווחי הון", "FIXED_CONTRACTUAL", "OTHER_EXPENSE"),
    exp("taxes.other", "Other tax", "מס אחר", "FIXED_CONTRACTUAL", "OTHER_EXPENSE"),
  ]),

  // Financial drag: the optimisation target. Every leaf here is avoidable overhead.
  exp("financial_fees", "Financial fees & drag", "עמלות ודליפה פיננסית", "FINANCIAL_DRAG", "OTHER_EXPENSE", [
    exp("financial_fees.bank_fees", "Bank fees (amlot)", "עמלות בנק", "FINANCIAL_DRAG", "OTHER_EXPENSE"),
    exp("financial_fees.card_fees", "Card fees", "דמי כרטיס", "FINANCIAL_DRAG", "OTHER_EXPENSE"),
    exp("financial_fees.fx_markup", "FX conversion markup", "מרווח המרת מט״ח", "FINANCIAL_DRAG", "OTHER_EXPENSE"),
    exp("financial_fees.overdraft_interest", "Overdraft interest", "ריבית חובה", "FINANCIAL_DRAG", "OTHER_EXPENSE"),
    exp("financial_fees.loan_interest", "Loan interest", "ריבית הלוואות", "FINANCIAL_DRAG", "LOAN_PAYMENT"),
    exp("financial_fees.dormant_subscriptions", "Dormant subscriptions", "מנויים לא בשימוש", "FINANCIAL_DRAG", "OTHER_EXPENSE"),
  ]),

  // Savings flows are NOT expenses (owner decision D7) — capital already deployed.
  exp("savings", "Savings & contributions", "חיסכון והפקדות", "SAVINGS_FLOW", null, [
    exp("savings.pension", "Pension contribution", "הפקדה לפנסיה", "SAVINGS_FLOW", "PENSION_CONTRIBUTION"),
    exp("savings.hishtalmut", "Keren Hishtalmut", "קרן השתלמות", "SAVINGS_FLOW", "HISHTALMUT_CONTRIBUTION"),
    exp("savings.gemel", "Kupat Gemel", "קופת גמל", "SAVINGS_FLOW", "PENSION_CONTRIBUTION"),
    exp("savings.investment_deposit", "Investment deposit", "הפקדה להשקעות", "SAVINGS_FLOW", null),
    exp("savings.standing_order", "Savings standing order", "הוראת קבע לחיסכון", "SAVINGS_FLOW", null),
  ]),

  // Transfers are excluded from BOTH income and expense — this is what prevents the
  // bank-side card settlement from double-counting the itemised card statement.
  exp("transfers", "Transfers (excluded)", "העברות (לא נספר)", "TRANSFER", null, [
    exp("transfers.card_settlement", "Credit-card settlement", "חיוב כרטיס אשראי", "TRANSFER", null),
    exp("transfers.internal", "Between own accounts", "בין חשבונות שלי", "TRANSFER", null),
    exp("transfers.person", "Person-to-person", "העברה אישית", "TRANSFER", null),
  ]),

  exp("other", "Other / Unclassified", "אחר / לא מסווג", "VARIABLE_DISCRETIONARY", "OTHER_EXPENSE", [
    // The suspense bucket. Low-confidence transactions land here and are STILL counted
    // (non-blocking rule) — the period is simply flagged as provisional.
    exp("other.unclassified", "Unclassified", "לא מסווג", "VARIABLE_DISCRETIONARY", "OTHER_EXPENSE"),
  ]),
];

/** The system category every low-confidence classification falls back to. */
export const UNCLASSIFIED_KEY = "other.unclassified";

/** Flatten the tree to (key, parentKey, sortOrder) rows for seeding. */
export function flattenCategoryTree(
  tree: SeedCategory[] = DEFAULT_CATEGORY_TREE,
): Array<SeedCategory & { parentKey: string | null; sortOrder: number }> {
  const out: Array<SeedCategory & { parentKey: string | null; sortOrder: number }> = [];
  const walk = (nodes: SeedCategory[], parentKey: string | null): void => {
    nodes.forEach((n, i) => {
      out.push({ ...n, parentKey, sortOrder: i });
      if (n.children) walk(n.children, n.key);
    });
  };
  walk(tree, null);
  return out;
}
