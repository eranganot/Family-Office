/**
 * Israel tax matrices — tax year 2026, version 1.
 * Researched 2026-07-05 from public sources; PENDING OWNER REVIEW (ownerReviewed=false
 * until Eran signs off). 2026 bracket widening legislated March 2026, retroactive to Jan 1.
 * CPI indexation of most ceilings frozen 2025–2027 by law.
 */
export const IL_2026 = {
  INCOME_TAX_BRACKETS: {
    brackets: [
      { upToAnnualILS: 84_120, ratePct: 10 },   // ₪7,010/mo
      { upToAnnualILS: 120_720, ratePct: 14 },  // ₪10,060/mo
      { upToAnnualILS: 228_000, ratePct: 20 },  // ₪19,000/mo (widened 2026)
      { upToAnnualILS: 301_200, ratePct: 31 },  // ₪25,100/mo (widened 2026)
      { upToAnnualILS: 560_280, ratePct: 35 },  // ₪46,690/mo — VERIFY: pre-reform boundary, assumed unchanged under freeze
      { upToAnnualILS: null, ratePct: 47 },
    ],
    surtax: { thresholdAnnualILS: 721_560, ratePct: 3 },
    creditPointAnnualILS: 2_904, // ₪242/mo
    residentCreditPoints: 2.25,
    meta: {
      sources: [
        "https://msl.org.il/research/income-tax-brackets-2026/",
        "https://finance.experts-il.com/caspit/%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA-%D7%9E%D7%A1-%D7%94%D7%9B%D7%A0%D7%A1%D7%94-2026/",
        "https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA_%D7%9E%D7%A1_%D7%94%D7%9B%D7%A0%D7%A1%D7%94",
      ],
      notes: [
        "2026 reform: 20% bracket widened to ₪19,000/mo, 31% to ₪25,100/mo (law published 2026-03, retroactive to 2026-01-01)",
        "VERIFY on review: 35%→47% boundary assumed ₪46,690/mo (frozen from 2025)",
        "Women receive 2.75 credit points (base)",
      ],
      ownerReviewed: false,
      capturedAt: "2026-07-05",
    },
  },
  CAPITAL_GAINS: {
    realGainIndividualPct: 25,
    substantialShareholderPct: 30,
    meta: {
      sources: ["https://www.kolzchut.org.il/he/%D7%9E%D7%A1_%D7%A8%D7%95%D7%95%D7%97%D7%99_%D7%94%D7%95%D7%9F"],
      notes: ["Stable statutory rates (real gain); surtax may apply above the yesef threshold"],
      ownerReviewed: false,
      capturedAt: "2026-07-05",
    },
  },
  HISHTALMUT_CEILINGS: {
    salariedMonthlySalaryCeilingILS: 15_712,
    salariedEmployerPct: 7.5,
    salariedEmployeePct: 2.5,
    selfEmployedExemptDepositAnnualILS: 20_566,
    selfEmployedDeductionPctOfIncome: 4.5,
    selfEmployedIncomeCeilingAnnualILS: 293_379,
    meta: {
      sources: [
        "https://www.analyst.co.il/articles/deposit-amount/",
        "https://pensuni.com/?p=2465",
        "https://www.fnx.co.il/ishtalmutfund/taxbenefits/",
      ],
      notes: ["Self-employed max deduction 2026: ₪13,203 (4.5% × ₪293,379)"],
      ownerReviewed: false,
      capturedAt: "2026-07-05",
    },
  },
  PENSION_CEILINGS: {
    qualifiedIncomeAnnualILS: 232_800,
    maxBenefitDepositPctOfQualified: 16.5,
    section47MonthlySalaryCeilingILS: 9_700,
    meta: {
      sources: [
        "https://www.supermarker.themarker.com/Gemel/TaxBenefitsForKupatGemelAndHishtalmut.aspx",
        "https://pensuni.com/?p=1447",
        "https://www.kolzchut.org.il/he/%D7%94%D7%98%D7%91%D7%95%D7%AA_%D7%91%D7%9E%D7%A1_%D7%94%D7%9B%D7%A0%D7%A1%D7%94_%D7%91%D7%92%D7%99%D7%9F_%D7%94%D7%A4%D7%A7%D7%93%D7%95%D7%AA_%D7%A2%D7%A6%D7%9E%D7%90%D7%99%D7%95%D7%AA_%D7%9C%D7%91%D7%99%D7%98%D7%95%D7%97_%D7%A4%D7%A0%D7%A1%D7%99%D7%95%D7%A0%D7%99",
      ],
      notes: ["Max tax-advantaged self deposit 2026: ₪38,412 (16.5% × ₪232,800); split deduction/credit per sections 45a/47"],
      ownerReviewed: false,
      capturedAt: "2026-07-05",
    },
  },
  BITUACH_LEUMI: {
    reducedRateMonthlyThresholdILS: 7_703,
    monthlyIncomeCeilingILS: 51_910,
    employeeRates: {
      reducedPct: null, // NEEDS_VERIFICATION: conflicting figures (3.5% classic vs 4.27% in one source); thresholds are solid
      fullPct: null, // NEEDS_VERIFICATION: 12% classic vs 12.17% in one source
    },
    meta: {
      sources: [
        "https://www.btl.gov.il/Insurance/Rates/Pages/default.aspx",
        "https://www.malam-payroll.com/national-insurance-updates-for-2026/",
      ],
      notes: [
        "Thresholds verified: reduced-rate portion up to ₪7,703/mo; ceiling ₪51,910/mo (2026)",
        "Employee rate figures conflict across sources — left null until owner review; strategy engine v1 does not compute BL",
      ],
      ownerReviewed: false,
      capturedAt: "2026-07-05",
    },
  },
  PURCHASE_TAX: {
    singleHome: [
      { upToAnnualILS: 1_978_745, ratePct: 0 },
      { upToAnnualILS: 2_347_040, ratePct: 3.5 },
      { upToAnnualILS: 6_055_070, ratePct: 5 },
      { upToAnnualILS: 20_183_565, ratePct: 8 },
      { upToAnnualILS: null, ratePct: 10 },
    ],
    additionalHome: [
      { upToAnnualILS: 6_055_070, ratePct: 8 },
      { upToAnnualILS: null, ratePct: 10 },
    ],
    meta: {
      sources: [
        "https://doron-aharoni.com/%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA-%D7%9E%D7%A1-%D7%A8%D7%9B%D7%99%D7%A9%D7%94-2026/",
        "https://israel-law.co/%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA-%D7%9E%D7%A1-%D7%A8%D7%9B%D7%99%D7%A9%D7%94-2026/",
      ],
      notes: ["Amounts are property values (ILS), not annual income; field name kept generic for the shared bracket schema", "Bracket indexation frozen 2025–2027"],
      ownerReviewed: false,
      capturedAt: "2026-07-05",
    },
  },
} as const;
