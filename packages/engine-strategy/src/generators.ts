import type { Finding } from "./findings";
import { RationaleSchema, type RecommendationDraft } from "./rationale";
import { validateStrategyText } from "./validator";

/**
 * Rule-based generators: finding → full recommendation draft. Strategy-level ONLY;
 * every draft passes the product-reference validator or generation throws (a
 * generator emitting product advice is a bug, not a warning).
 */

type Generator = (f: Finding) => RecommendationDraft | null;

const severityConfidence = { WARNING: 80, NOTICE: 70, INFO: 60 } as const;

const GENERATORS: Record<string, Generator> = {
  LIQUIDITY_BELOW_TARGET: (f) => ({
    type: "INCREASE_LIQUIDITY",
    title: `Build the emergency fund up to ${f.metrics["targetMonths"]} months of expenses`,
    titleHe: `להשלים את קרן החירום ל-${f.metrics["targetMonths"]} חודשי הוצאה`,
    rationale: {
      why: `Liquid runway is ${f.metrics["runwayMonths"]} months against a target of ${f.metrics["targetMonths"]}; an income shock would force selling long-term holdings or taking expensive credit at the worst time.`,
      benefits: ["Shock absorption without forced sales", "Cheaper than emergency credit", "Reduces stress on every other financial decision"],
      risks: ["Cash held for safety lags inflation slightly"],
      tradeoffs: ["Money parked for emergencies is not compounding in long-term investments"],
      taxImplications: "None for holding liquid reserves; interest on deposits is taxable at the standard rate.",
      liquidityImplications: "Directly increases household liquidity.",
      timeHorizon: "SHORT",
      sensitivity: "Sensitive to the monthly-expense estimate; re-check after mapping all expense flows.",
      alternatives: ["A committed credit line as partial backstop (weaker: costs and can be withdrawn)", "Staggered bank deposits with laddered maturities"],
      expectedImpact: `Close a gap of roughly ${Number(f.metrics["targetMonths"]) - Number(f.metrics["runwayMonths"])} months of expenses in liquid reserves.`,
    },
    subscores: { impact: 85, ease: 70, taxBenefit: 10, riskReduction: 90, goalContribution: 80, urgency: 85 },
    confidence: severityConfidence.WARNING,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: ["EMERGENCY_FUND"],
    assumptionKeysUsed: ["emergency_fund_months"],
  }),

  EXCESS_IDLE_CASH: (f) => ({
    type: "REDUCE_IDLE_CASH",
    title: "Put idle cash beyond the emergency buffer to work",
    titleHe: "להעביר מזומן עודף מעבר לכרית הביטחון לאפיקים מניבים",
    rationale: {
      why: `Cash covering ${f.metrics["cashMonths"]} months of expenses sits idle versus a ${f.metrics["targetMonths"]}-month target; inflation erodes its real value every year.`,
      benefits: ["Restores long-term purchasing power", "Aligns allocation with household goals"],
      risks: ["Invested amounts fluctuate in value", "Timing of deployment affects short-term results"],
      tradeoffs: ["Less immediate liquidity beyond the retained buffer"],
      taxImplications: "Gains in taxable channels are subject to capital-gains tax; tax-advantaged wrappers may apply first (see separate recommendations).",
      liquidityImplications: "Keeps the full emergency buffer; only the excess is deployed.",
      timeHorizon: "MEDIUM",
      sensitivity: "Sensitive to the expense estimate and the emergency-fund target assumption.",
      alternatives: ["Gradual deployment over several months", "Short-term deposits as an interim step"],
      expectedImpact: "Excess cash begins compounding toward long-term goals instead of eroding.",
    },
    subscores: { impact: 70, ease: 75, taxBenefit: 30, riskReduction: 20, goalContribution: 75, urgency: 40 },
    confidence: severityConfidence.NOTICE,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: ["FINANCIAL_INDEPENDENCE", "RETIREMENT", "LIFESTYLE"],
    assumptionKeysUsed: ["emergency_fund_months", "expected_real_return_equity_pct", "inflation_il_pct"],
  }),

  CONCENTRATION_SINGLE_ASSET: (f) => ({
    type: "REDUCE_CONCENTRATION_RISK",
    title: `Reduce single-position concentration (${f.metrics["itemName"]})`,
    titleHe: `להקטין ריכוזיות בנכס בודד (${f.metrics["itemName"]})`,
    rationale: {
      why: `One position holds ${f.metrics["sharePct"]}% of household assets (threshold ${f.metrics["thresholdPct"]}%); an idiosyncratic shock to it would hit the whole household plan.`,
      benefits: ["Lower dependence on a single outcome", "Smoother long-term path toward goals"],
      risks: ["Realizing gains may trigger tax now rather than later"],
      tradeoffs: ["If the concentrated position outperforms, diversification lowers upside"],
      taxImplications: "Reducing a position can realize capital gains; spreading realization across tax years may soften the hit.",
      liquidityImplications: "Diversified holdings are typically easier to draw on gradually.",
      timeHorizon: "MEDIUM",
      sensitivity: "Depends on valuation freshness of the concentrated position.",
      alternatives: ["Divert only NEW savings elsewhere (slower, no tax event)", "Staged reduction over multiple years"],
      expectedImpact: `Bring the position below ${f.metrics["thresholdPct"]}% of household assets.`,
    },
    subscores: { impact: 80, ease: 50, taxBenefit: 0, riskReduction: 85, goalContribution: 60, urgency: 55 },
    confidence: severityConfidence.WARNING,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: ["FINANCIAL_INDEPENDENCE", "RETIREMENT"],
    assumptionKeysUsed: ["concentration_single_asset_max_pct"],
  }),

  CONCENTRATION_INSTITUTION: (f) => ({
    type: "REDUCE_INSTITUTION_CONCENTRATION",
    title: `Spread holdings across managing institutions (${f.metrics["institution"]})`,
    titleHe: `לפזר החזקות בין גופים מנהלים (${f.metrics["institution"]})`,
    rationale: {
      why: `${f.metrics["sharePct"]}% of assets sit with one institution; operational issues, fee drift, or service degradation there affect most of the household at once.`,
      benefits: ["Operational resilience", "Better fee-negotiation position"],
      risks: ["More accounts to track"],
      tradeoffs: ["Some institutions give scale discounts that splitting forfeits"],
      taxImplications: "Transfers between managers of the same wrapper type are typically not tax events in Israel.",
      liquidityImplications: "Neutral.",
      timeHorizon: "LONG",
      sensitivity: "Low; based on current custodial distribution.",
      alternatives: ["Keep concentration but negotiate fees with scale", "Split only new contributions"],
      expectedImpact: "No single institution manages a majority of household assets.",
    },
    subscores: { impact: 40, ease: 60, taxBenefit: 0, riskReduction: 55, goalContribution: 20, urgency: 20 },
    confidence: severityConfidence.NOTICE,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: [],
    assumptionKeysUsed: ["concentration_institution_max_pct"],
  }),

  CURRENCY_HOME_BIAS: (f) => ({
    type: "IMPROVE_GEO_DIVERSIFICATION",
    title: "Add foreign-currency / global exposure",
    titleHe: "להוסיף חשיפה גלובלית ומטבעית",
    rationale: {
      why: `Only ${f.metrics["foreignPct"]}% of assets are outside ${f.metrics["baseCurrency"]}; household income, property, and savings all depend on one economy and currency.`,
      benefits: ["Cushions local-economy and currency shocks", "Access to global growth"],
      risks: ["Exchange-rate swings add short-term volatility"],
      tradeoffs: ["Foreign holdings complicate tax reporting slightly"],
      taxImplications: "Foreign income/gains are taxable in Israel; wrappers differ in withholding treatment.",
      liquidityImplications: "Neutral to positive; global markets are deep.",
      timeHorizon: "LONG",
      sensitivity: `Sensitive to the ${f.metrics["minPct"]}% minimum-exposure assumption — adjust it to your comfort.`,
      alternatives: ["Increase gradually via new contributions only", "Currency exposure without asset exposure (weaker diversification)"],
      expectedImpact: `Raise foreign exposure toward at least ${f.metrics["minPct"]}% of assets.`,
    },
    subscores: { impact: 65, ease: 65, taxBenefit: 0, riskReduction: 70, goalContribution: 50, urgency: 30 },
    confidence: severityConfidence.NOTICE,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: ["FINANCIAL_INDEPENDENCE", "RETIREMENT"],
    assumptionKeysUsed: ["currency_foreign_min_pct"],
  }),

  CURRENCY_FOREIGN_EXCESS: (f) => ({
    type: "REBALANCE_CURRENCY_EXPOSURE",
    title: "Trim excess foreign-currency exposure",
    titleHe: "לאזן חשיפה מטבעית עודפת",
    rationale: {
      why: `${f.metrics["foreignPct"]}% of assets are in foreign currency against a ${f.metrics["maxPct"]}% ceiling, while household expenses are in the base currency — a strong shekel squeezes the plan.`,
      benefits: ["Better match between assets and future expenses"],
      risks: ["Conversion locks in current exchange rates"],
      tradeoffs: ["Less upside if the shekel weakens"],
      taxImplications: "Currency conversion itself is not a tax event; realizing gains may be.",
      liquidityImplications: "Neutral.",
      timeHorizon: "MEDIUM",
      sensitivity: "Sensitive to the ceiling assumption and to expected future expense currency mix.",
      alternatives: ["Rebalance via new savings only", "Partial currency hedging"],
      expectedImpact: `Bring foreign exposure under ${f.metrics["maxPct"]}%.`,
    },
    subscores: { impact: 55, ease: 60, taxBenefit: 0, riskReduction: 60, goalContribution: 40, urgency: 30 },
    confidence: severityConfidence.NOTICE,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: [],
    assumptionKeysUsed: ["currency_foreign_max_pct"],
  }),

  TAX_HISHTALMUT_MISSING: (f) => ({
    type: "INCREASE_TAX_ADVANTAGED_SAVINGS",
    title: `Open/renew a keren hishtalmut for ${f.metrics["memberName"]}`,
    titleHe: `לפתוח/לחדש קרן השתלמות עבור ${f.metrics["memberName"]}`,
    rationale: {
      why: `No keren hishtalmut is mapped for ${f.metrics["memberName"]}. It is Israel's only fully capital-gains-exempt medium-term vehicle (exempt deposit ceiling ₪${f.metrics["exemptCeilingAnnualILS"]}/year).`,
      benefits: ["Capital-gains exemption on qualifying deposits", "Employer-matched contributions for employees", "Liquid after 6 years"],
      risks: ["Funds are locked for the vesting period"],
      tradeoffs: ["Contributions reduce take-home pay today"],
      taxImplications: "Deposits within the ceiling grow and are withdrawn tax-free after vesting; employer contributions within limits are not taxed as salary.",
      liquidityImplications: "Locked ~6 years, then fully liquid — plan the emergency fund separately.",
      timeHorizon: "IMMEDIATE",
      sensitivity: "Ceilings are year-specific (see TaxRegistry, pending owner review).",
      alternatives: ["Gemel lehashkaa (liquid anytime, taxed at withdrawal)", "Taxable saving (no exemption)"],
      expectedImpact: "Capture the annual exempt ceiling for this member from now on — compounding tax-free.",
    },
    subscores: { impact: 75, ease: 85, taxBenefit: 95, riskReduction: 10, goalContribution: 65, urgency: 60 },
    confidence: severityConfidence.NOTICE,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: ["FINANCIAL_INDEPENDENCE", "CHILDREN_EDUCATION"],
    assumptionKeysUsed: [],
  }),

  TAX_PENSION_MISSING: (f) => ({
    type: "INCREASE_RETIREMENT_ALLOCATION",
    title: `Establish pension coverage for ${f.metrics["memberName"]}`,
    titleHe: `להסדיר כיסוי פנסיוני עבור ${f.metrics["memberName"]}`,
    rationale: {
      why: `No pension vehicle is mapped for ${f.metrics["memberName"]} — the household's retirement leg and its embedded disability/survivor insurance are missing for this member.`,
      benefits: ["Tax-deductible/credited contributions (sections 45a/47)", "Embedded disability and survivor coverage", "Compounding toward retirement"],
      risks: ["Locked until retirement age except in hardship tracks"],
      tradeoffs: ["Less flexible than taxable savings"],
      taxImplications: "Contributions enjoy deduction and credit benefits up to registry ceilings; growth is tax-deferred.",
      liquidityImplications: "Illiquid until retirement — size other buffers accordingly.",
      timeHorizon: "IMMEDIATE",
      sensitivity: "Benefit size depends on income level vs registry ceilings.",
      alternatives: ["IRA-style self-managed gemel for the investment leg (insurance handled separately)"],
      expectedImpact: "Retirement compounding plus insurance coverage begins for this member.",
    },
    subscores: { impact: 90, ease: 75, taxBenefit: 90, riskReduction: 75, goalContribution: 90, urgency: 80 },
    confidence: severityConfidence.WARNING,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: ["RETIREMENT"],
    assumptionKeysUsed: [],
  }),

  HIGH_MANAGEMENT_FEE: (f) => ({
    type: "REDUCE_FEE_DRAG",
    title: `Negotiate or move: ${f.metrics["feePct"]}% fee on ${f.metrics["itemName"]}`,
    titleHe: `להוזיל דמי ניהול: ${f.metrics["feePct"]}% על ${f.metrics["itemName"]}`,
    rationale: {
      why: `Management fee of ${f.metrics["feePct"]}% exceeds the ${f.metrics["noticePct"]}% notice level; over decades fee drag compounds into a large share of the final balance.`,
      benefits: ["Every basis point saved compounds for you instead of the manager"],
      risks: ["None material; transfers between same-type wrappers preserve rights"],
      tradeoffs: ["Negotiation/transfer takes some effort"],
      taxImplications: "Same-wrapper transfers are not tax events in Israel.",
      liquidityImplications: "None.",
      timeHorizon: "SHORT",
      sensitivity: "Savings scale with balance and remaining horizon.",
      alternatives: ["Fee negotiation with the current manager", "Transfer to a lower-fee manager of the same product type"],
      expectedImpact: "Reduce annual fee drag on this account toward market-typical levels.",
    },
    subscores: { impact: 60, ease: 80, taxBenefit: 20, riskReduction: 10, goalContribution: 50, urgency: 40 },
    confidence: severityConfidence.NOTICE,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: ["RETIREMENT", "FINANCIAL_INDEPENDENCE"],
    assumptionKeysUsed: ["management_fee_notice_pct"],
  }),

  MORTGAGE_CPI_CONCENTRATION: (f) => ({
    type: "RESTRUCTURE_MORTGAGE_MIX",
    title: `Review CPI-linked share of the mortgage (${f.metrics["cpiSharePct"]}%)`,
    titleHe: `לבחון את רכיב ההצמדה במשכנתא (${f.metrics["cpiSharePct"]}%)`,
    rationale: {
      why: `${f.metrics["cpiSharePct"]}% of the mortgage principal is CPI-linked (threshold ${f.metrics["thresholdPct"]}%); sustained inflation raises both principal and payments simultaneously.`,
      benefits: ["Caps inflation pass-through into household debt", "More predictable payments"],
      risks: ["Unlinked tracks usually carry higher nominal rates", "Early-repayment fees may apply"],
      tradeoffs: ["Paying certainty premium vs keeping cheaper-but-linked debt"],
      taxImplications: "None directly.",
      liquidityImplications: "Refinancing costs cash up front (fees, appraisal).",
      timeHorizon: "MEDIUM",
      sensitivity: "Highly sensitive to the inflation assumption and remaining term.",
      alternatives: ["Partial early repayment of linked tracks specifically", "Wait for a favorable refinance window"],
      expectedImpact: `Bring the CPI-linked share below ${f.metrics["thresholdPct"]}% of principal.`,
    },
    subscores: { impact: 65, ease: 40, taxBenefit: 0, riskReduction: 70, goalContribution: 35, urgency: 35 },
    confidence: severityConfidence.NOTICE,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: [],
    assumptionKeysUsed: ["mortgage_cpi_linked_max_pct", "inflation_il_pct"],
  }),

  MORTGAGE_EXPENSIVE_TRACK: (f) => ({
    type: "ACCELERATE_DEBT_REPAYMENT",
    title: `Target the expensive mortgage track first (${f.metrics["maxRatePct"]}%)`,
    titleHe: `לטפל קודם במסלול המשכנתא היקר (${f.metrics["maxRatePct"]}%)`,
    rationale: {
      why: `A mortgage track carries ${f.metrics["maxRatePct"]}% — repaying it is a guaranteed, risk-free "return" at that rate, likely above expected investment returns.`,
      benefits: ["Guaranteed saving equal to the interest rate", "Lower monthly obligations"],
      risks: ["Uses liquidity that may be needed elsewhere"],
      tradeoffs: ["Early-repayment fees can offset part of the gain — check the schedule"],
      taxImplications: "None.",
      liquidityImplications: "Reduces liquid reserves by the repaid amount.",
      timeHorizon: "SHORT",
      sensitivity: "Compare against the expected-return assumption and any early-repayment fee.",
      alternatives: ["Refinance the track instead of repaying", "Split: partial repayment + keep buffer"],
      expectedImpact: "Interest saved at the track's full rate on every shekel repaid early.",
    },
    subscores: { impact: 70, ease: 55, taxBenefit: 0, riskReduction: 60, goalContribution: 45, urgency: 50 },
    confidence: severityConfidence.NOTICE,
    evidenceItemIds: f.evidenceItemIds,
    goalTypesImproved: [],
    assumptionKeysUsed: ["expected_real_return_equity_pct", "expensive_debt_rate_pct"],
  }),
};

export interface GenerationResult {
  drafts: RecommendationDraft[];
  unmappedFindings: string[];
}

export function generateRecommendations(findings: Finding[]): GenerationResult {
  const drafts: RecommendationDraft[] = [];
  const unmapped: string[] = [];
  for (const finding of findings) {
    const generator = GENERATORS[finding.code];
    if (!generator) { unmapped.push(finding.code); continue; }
    const draft = generator(finding);
    if (!draft) continue;
    RationaleSchema.parse(draft.rationale);
    const validation = validateStrategyText([
      draft.title, draft.titleHe,
      draft.rationale.why, draft.rationale.expectedImpact,
      ...draft.rationale.benefits, ...draft.rationale.alternatives, ...draft.rationale.tradeoffs,
    ]);
    if (!validation.valid) {
      throw new Error(`PRODUCT_REFERENCE_IN_GENERATOR:${finding.code}:${validation.pattern}`);
    }
    drafts.push(draft);
  }
  return { drafts, unmappedFindings: [...new Set(unmapped)] };
}
