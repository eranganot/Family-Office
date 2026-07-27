import type { BehavioralClassKey } from "./categories";

/**
 * Deterministic merchant classification rules (owner decision D3 — no LLM anywhere).
 *
 * Placement note: the design package put these in `packages/registry`. They live in
 * `domain` instead, for the same reason the category tree does — registry is for
 * versioned regulatory data persisted in the DB, whereas these are pure lookup data
 * with no DB representation, and keeping them here lets the engine stay free of a
 * registry (and therefore prisma) dependency.
 *
 * VERSIONING: `MERCHANT_RULES_VERSION` is stamped onto every classification this table
 * produces (`TransactionClassification.ruleVersion`). Bump it on ANY change to the
 * rules below. A bumped version does not silently rewrite existing classifications —
 * owner-CONFIRMED rows always win (see classify.ts precedence).
 *
 * PATTERN AUTHORING: write patterns in natural logical-order Hebrew or plain Latin.
 * They are compiled through the same normalisation the merchant key goes through
 * (uppercase + Hebrew final-form folding), so you never hand-fold them yourself.
 *
 * CONFIDENCE: the threshold below which a match is routed to the Suspense Queue is
 * `operations_classification_min_confidence` (default 0.85) — it lives in the
 * AssumptionRegistry, never here. Rules that are strong but not certain are given a
 * value UNDER that threshold on purpose: they pre-fill the category for the owner to
 * confirm rather than silently deciding.
 */
export const MERCHANT_RULES_VERSION = "merchant-rules@1.0.0-m37";

export interface MerchantRule {
  /** Stable id, for debugging and for explaining "why was this categorised so". */
  id: string;
  /** Matched as a substring of the normalised merchant key, or as a regex if `re`. */
  match: string;
  re?: boolean;
  categoryKey: string;
  behavioral: BehavioralClassKey;
  /** 0..1. >= the registry threshold auto-applies; below it goes to Suspense pre-filled. */
  confidence: number;
}

/**
 * Ordered: the FIRST match wins, so put specific rules before general ones.
 * Merchant names are deliberately generic categories rather than the household's own
 * vendors — the public-repo rule forbids shipping household data, and generic terms
 * generalise better anyway.
 */
export const MERCHANT_RULES: MerchantRule[] = [
  // --- Transfers & settlements (must come FIRST: they are excluded from both sides)
  { id: "settle.isracard", match: "ישראכרט", categoryKey: "transfers.card_settlement", behavioral: "TRANSFER", confidence: 0.97 },
  { id: "settle.cal", match: "כאל", categoryKey: "transfers.card_settlement", behavioral: "TRANSFER", confidence: 0.95 },
  { id: "settle.visa", match: "ויזה", categoryKey: "transfers.card_settlement", behavioral: "TRANSFER", confidence: 0.9 },
  { id: "settle.max", match: "מקס איט", categoryKey: "transfers.card_settlement", behavioral: "TRANSFER", confidence: 0.95 },
  { id: "settle.diners", match: "דיינרס", categoryKey: "transfers.card_settlement", behavioral: "TRANSFER", confidence: 0.95 },
  { id: "xfer.bit", match: "BIT", categoryKey: "transfers.person", behavioral: "TRANSFER", confidence: 0.9 },
  { id: "xfer.paybox", match: "PAYBOX", categoryKey: "transfers.person", behavioral: "TRANSFER", confidence: 0.9 },
  { id: "xfer.generic", match: "העברה", categoryKey: "transfers.internal", behavioral: "TRANSFER", confidence: 0.6 },
  { id: "xfer.cheque", match: "משיכת שיק", categoryKey: "transfers.internal", behavioral: "TRANSFER", confidence: 0.7 },

  // --- Income
  { id: "inc.salary", match: "משכורת", categoryKey: "income.salary.base", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "inc.salary2", match: "שכר", categoryKey: "income.salary.base", behavioral: "FIXED_CONTRACTUAL", confidence: 0.7 },
  { id: "inc.allowance", match: "קצבת ילדים", categoryKey: "income.government.child_allowance", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "inc.bituach_leumi", match: "ביטוח לאומי", categoryKey: "income.government.other", behavioral: "FIXED_CONTRACTUAL", confidence: 0.6 },

  // --- Savings flows (NOT expenses — owner decision D7)
  { id: "sav.hishtalmut", match: "השתלמות", categoryKey: "savings.hishtalmut", behavioral: "SAVINGS_FLOW", confidence: 0.95 },
  { id: "sav.gemel", match: "גמל", categoryKey: "savings.gemel", behavioral: "SAVINGS_FLOW", confidence: 0.9 },
  { id: "sav.pension", match: "פנסיה", categoryKey: "savings.pension", behavioral: "SAVINGS_FLOW", confidence: 0.9 },
  { id: "sav.menora", match: "מנורה מבטחים", categoryKey: "savings.pension", behavioral: "SAVINGS_FLOW", confidence: 0.7 },

  // --- Financial drag (the optimisation target)
  { id: "drag.card_fee", match: "דמי כרטיס", categoryKey: "financial_fees.card_fees", behavioral: "FINANCIAL_DRAG", confidence: 0.97 },
  { id: "drag.bank_fee", match: "עמלת", categoryKey: "financial_fees.bank_fees", behavioral: "FINANCIAL_DRAG", confidence: 0.9 },
  { id: "drag.bank_fee2", match: "עמלות", categoryKey: "financial_fees.bank_fees", behavioral: "FINANCIAL_DRAG", confidence: 0.9 },
  { id: "drag.mgmt_fee", match: "דמי ניהול", categoryKey: "financial_fees.bank_fees", behavioral: "FINANCIAL_DRAG", confidence: 0.9 },
  { id: "drag.overdraft", match: "ריבית חובה", categoryKey: "financial_fees.overdraft_interest", behavioral: "FINANCIAL_DRAG", confidence: 0.95 },

  // --- Housing & utilities
  { id: "hous.mortgage", match: "משכנתא", categoryKey: "housing.mortgage", behavioral: "FIXED_CONTRACTUAL", confidence: 0.97 },
  { id: "hous.arnona", match: "ארנונה", categoryKey: "housing.arnona", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "hous.iriya", match: "עירית", categoryKey: "housing.arnona", behavioral: "FIXED_CONTRACTUAL", confidence: 0.75 },
  { id: "hous.electric", match: "חשמל", categoryKey: "housing.electricity", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "hous.water", match: "מי ", categoryKey: "housing.water", behavioral: "FIXED_CONTRACTUAL", confidence: 0.7 },
  { id: "hous.water2", match: "תאגיד המים", categoryKey: "housing.water", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "hous.gas", match: "גז", categoryKey: "housing.gas", behavioral: "FIXED_CONTRACTUAL", confidence: 0.7 },
  { id: "hous.vaad", match: "ועד בית", categoryKey: "housing.vaad_bayit", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "util.partner", match: "פרטנר", categoryKey: "housing.internet_tv", behavioral: "FIXED_CONTRACTUAL", confidence: 0.85 },
  { id: "util.cellcom", match: "סלקום", categoryKey: "housing.internet_tv", behavioral: "FIXED_CONTRACTUAL", confidence: 0.85 },
  { id: "util.hot", match: "HOT", categoryKey: "housing.internet_tv", behavioral: "FIXED_CONTRACTUAL", confidence: 0.85 },
  { id: "util.bezeq", match: "בזק", categoryKey: "housing.internet_tv", behavioral: "FIXED_CONTRACTUAL", confidence: 0.9 },

  // --- Insurance
  { id: "ins.dira", match: "ביטוח דירה", categoryKey: "housing.home_insurance", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "ins.hova", match: "ביטוח חובה", categoryKey: "transport.vehicle_insurance", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "ins.rechev", match: "ביטוח רכב", categoryKey: "transport.vehicle_insurance", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "ins.life", match: "ביטוח חיים", categoryKey: "insurance.life", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "ins.generic", match: "ביטוח", categoryKey: "insurance.life", behavioral: "FIXED_CONTRACTUAL", confidence: 0.55 },
  { id: "ins.harel", match: "הראל", categoryKey: "insurance.life", behavioral: "FIXED_CONTRACTUAL", confidence: 0.6 },
  { id: "ins.clal", match: "כלל ביטוח", categoryKey: "insurance.life", behavioral: "FIXED_CONTRACTUAL", confidence: 0.7 },

  // --- Transport
  { id: "tr.fuel_sonol", match: "סונול", categoryKey: "transport.fuel", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "tr.fuel_paz", match: "פז", categoryKey: "transport.fuel", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.8 },
  { id: "tr.fuel_delek", match: "דלק", categoryKey: "transport.fuel", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.85 },
  { id: "tr.fuel_ten", match: "טן", categoryKey: "transport.fuel", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.6 },
  { id: "tr.parking_pango", match: "פנגו", categoryKey: "transport.parking", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "tr.parking_cellopark", match: "סלופארק", categoryKey: "transport.parking", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "tr.parking", match: "חניון", categoryKey: "transport.parking", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "tr.lime", match: "LIME", categoryKey: "transport.taxi_micro", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "tr.bird", match: "BIRD", categoryKey: "transport.taxi_micro", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.85 },
  { id: "tr.gett", match: "GETT", categoryKey: "transport.taxi_micro", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "tr.public", match: "רב קו", categoryKey: "transport.public", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "tr.transport_auth", match: "רשות התחבורה", categoryKey: "transport.public", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "tr.licence", match: "רישוי", categoryKey: "transport.vehicle_licence", behavioral: "FIXED_CONTRACTUAL", confidence: 0.85 },

  // --- Food
  { id: "food.super_shufersal", match: "שופרסל", categoryKey: "food.groceries", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "food.super_rami", match: "רמי לוי", categoryKey: "food.groceries", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "food.super_victory", match: "ויקטורי", categoryKey: "food.groceries", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "food.super_yohananof", match: "יוחננוף", categoryKey: "food.groceries", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "food.super_tiv", match: "טיב טעם", categoryKey: "food.groceries", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "food.market", match: "מרקט", categoryKey: "food.groceries", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.8 },
  { id: "food.makolet", match: "מכולת", categoryKey: "food.groceries", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "food.wolt", match: "WOLT", categoryKey: "food.delivery", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "food.tenbis", match: "תן ביס", categoryKey: "food.delivery", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "food.coffee", match: "קפה", categoryKey: "food.coffee", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.85 },
  { id: "food.pizza", match: "פיצה", categoryKey: "food.restaurants", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "food.burger", match: "בורגר", categoryKey: "food.restaurants", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "food.sushi", match: "סושי", categoryKey: "food.restaurants", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "food.restaurant", match: "מסעד", categoryKey: "food.restaurants", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.85 },

  // --- Subscriptions / software (mostly Latin, mostly standing orders)
  { id: "sub.spotify", match: "SPOTIFY", categoryKey: "utilities.subscriptions", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "sub.netflix", match: "NETFLIX", categoryKey: "utilities.subscriptions", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "sub.youtube", match: "YOUTUBE", categoryKey: "utilities.subscriptions", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "sub.audible", match: "AUDIBLE", categoryKey: "utilities.subscriptions", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "sub.appletv", match: "APPLE", categoryKey: "utilities.subscriptions", behavioral: "FIXED_CONTRACTUAL", confidence: 0.7 },
  { id: "sub.google_one", match: "GOOGLE_ONE", categoryKey: "utilities.cloud_software", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "sub.google_cloud", match: "GOOGLE_CLOUD", categoryKey: "utilities.cloud_software", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "sub.aws", match: "AWS", categoryKey: "utilities.cloud_software", behavioral: "FIXED_CONTRACTUAL", confidence: 0.9 },
  { id: "sub.openai", match: "OPENAI", categoryKey: "utilities.cloud_software", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "sub.anthropic", match: "ANTHROPIC", categoryKey: "utilities.cloud_software", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "sub.railway", match: "RAILWAY", categoryKey: "utilities.cloud_software", behavioral: "FIXED_CONTRACTUAL", confidence: 0.9 },
  { id: "sub.github", match: "GITHUB", categoryKey: "utilities.cloud_software", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },

  // --- Health / education / childcare
  { id: "hlth.pharm_super", match: "סופר פארם", categoryKey: "healthcare.pharmacy", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "hlth.clalit", match: "כללית", categoryKey: "healthcare.kupat_holim", behavioral: "FIXED_CONTRACTUAL", confidence: 0.85 },
  { id: "hlth.maccabi", match: "מכבי", categoryKey: "healthcare.kupat_holim", behavioral: "FIXED_CONTRACTUAL", confidence: 0.8 },
  { id: "hlth.meuhedet", match: "מאוחדת", categoryKey: "healthcare.kupat_holim", behavioral: "FIXED_CONTRACTUAL", confidence: 0.85 },
  { id: "hlth.dental", match: "מרפאת שיניים", categoryKey: "healthcare.dental", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "edu.school", match: "בית ספר", categoryKey: "education.school", behavioral: "FIXED_CONTRACTUAL", confidence: 0.9 },
  { id: "edu.gan", match: "גן ילדים", categoryKey: "childcare.daycare", behavioral: "FIXED_CONTRACTUAL", confidence: 0.9 },
  { id: "edu.maon", match: "מעון", categoryKey: "childcare.daycare", behavioral: "FIXED_CONTRACTUAL", confidence: 0.85 },
  { id: "edu.chug", match: "חוג", categoryKey: "education.activities", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.7 },

  // --- Shopping / online
  { id: "shop.amazon", match: "AMAZON", categoryKey: "shopping.online", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "shop.aliexpress", match: "ALIEXPRESS", categoryKey: "shopping.online", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "shop.temu", match: "TEMU", categoryKey: "shopping.online", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "shop.iherb", match: "IHERB", categoryKey: "shopping.online", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "shop.ebay", match: "EBAY", categoryKey: "shopping.online", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "shop.ikea", match: "IKEA", categoryKey: "shopping.home", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "shop.fox", match: "FOX", categoryKey: "shopping.clothing", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.8 },
  { id: "shop.castro", match: "קסטרו", categoryKey: "shopping.clothing", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },

  // --- Travel
  { id: "trv.booking", match: "BOOKING", categoryKey: "travel.accommodation", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "trv.airbnb", match: "AIRBNB", categoryKey: "travel.accommodation", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.9 },
  { id: "trv.elal", match: "אל על", categoryKey: "travel.flights", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.95 },
  { id: "trv.airline", match: "AIRLINES", categoryKey: "travel.flights", behavioral: "VARIABLE_DISCRETIONARY", confidence: 0.85 },

  // --- Taxes
  { id: "tax.income", match: "מס הכנסה", categoryKey: "taxes.income_tax", behavioral: "FIXED_CONTRACTUAL", confidence: 0.95 },
  { id: "tax.mas", match: "רשות המסים", categoryKey: "taxes.other", behavioral: "FIXED_CONTRACTUAL", confidence: 0.9 },
];
