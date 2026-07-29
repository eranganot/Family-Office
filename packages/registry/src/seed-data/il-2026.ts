/**
 * Israel tax matrices — tax year 2026, version 1.
 *
 * Researched 2026-07-05 from public sources. OWNER-REVIEWED 2026-07-29 (Eran), after a
 * verification pass that resolved the outstanding VERIFY flag on the 35%→47% boundary and
 * added three things the matrices had been missing: the separate non-exertion bracket
 * ladder, the 2% capital-income surtax, and the woman's extra credit point.
 *
 * 2026 bracket widening legislated March 2026, retroactive to Jan 1.
 * CPI indexation of most ceilings frozen 2025–2027 by law.
 */
export const IL_2026 = {
  INCOME_TAX_BRACKETS: {
    brackets: [
      { upToAnnualILS: 84_120, ratePct: 10 },   // ₪7,010/mo
      { upToAnnualILS: 120_720, ratePct: 14 },  // ₪10,060/mo
      { upToAnnualILS: 228_000, ratePct: 20 },  // ₪19,000/mo (widened 2026)
      { upToAnnualILS: 301_200, ratePct: 31 },  // ₪25,100/mo (widened 2026)
      { upToAnnualILS: 560_280, ratePct: 35 },  // ₪46,690/mo — VERIFIED 2026-07-29 against kolzchut
      { upToAnnualILS: null, ratePct: 47 },
    ],
    /**
     * Brackets for income NOT from personal exertion (הכנסה שאינה מיגיעה אישית) —
     * rental, interest, dividends, royalties — for taxpayers UNDER 60.
     *
     * These are NOT the salary brackets. The first shekel is taxed at 31%, not 10%:
     * there is no low-rate runway on passive income. Modelling passive income on the
     * salary ladder understates the tax by up to ~21 points on the first ₪301,200.
     *
     * From age 60 (סעיף 121(ב)) this income uses the personal-exertion brackets above,
     * which is a genuine planning threshold rather than a rounding detail.
     */
    nonExertionBracketsUnder60: [
      { upToAnnualILS: 301_200, ratePct: 31 },
      { upToAnnualILS: 560_280, ratePct: 35 },
      { upToAnnualILS: null, ratePct: 47 },
    ],
    nonExertionUsesExertionBracketsFromAge: 60,
    surtax: { thresholdAnnualILS: 721_560, ratePct: 3 },
    /**
     * Since 1 Jan 2025, סעיף 121ב(א1) adds a FURTHER 2% on the portion of income that is
     * not from employment or business, above the same ₪721,560 threshold. It stacks on
     * the 3%, so capital income above the threshold bears 5% of surtax, not 3%.
     * Top marginal: 50% on exertion income, 52% on non-exertion income.
     */
    surtaxCapitalIncomeAdditionalPct: 2,
    creditPointAnnualILS: 2_904, // ₪242/mo
    residentCreditPoints: 2.25,
    /** A woman receives half a credit point more: 2.75 total, worth ₪7,986/yr in 2026. */
    womanAdditionalCreditPoints: 0.5,
    meta: {
      sources: [
        "https://msl.org.il/research/income-tax-brackets-2026/",
        "https://finance.experts-il.com/caspit/%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA-%D7%9E%D7%A1-%D7%94%D7%9B%D7%A0%D7%A1%D7%94-2026/",
        "https://www.kolzchut.org.il/he/%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA_%D7%9E%D7%A1_%D7%94%D7%9B%D7%A0%D7%A1%D7%94",
      ],
      notes: [
        "2026 reform: 20% bracket widened to ₪19,000/mo, 31% to ₪25,100/mo (law published 2026-03, retroactive to 2026-01-01)",
        "VERIFIED 2026-07-29 against kolzchut's 2026 table: 35% band runs 301,201–560,280 and 47% runs 560,281–721,560. The earlier 'assumed unchanged under freeze' caveat is resolved, not carried forward.",
        "ADDED 2026-07-29: separate bracket ladder for non-exertion income (31% from the first shekel, under 60). Passive income was previously modelled on the salary ladder, which understates tax by up to ~21 points on the first ₪301,200.",
        "ADDED 2026-07-29: סעיף 121ב(א1) 2% surtax on non-employment/non-business income above ₪721,560, stacking on the 3%. Top marginal 50% exertion / 52% non-exertion.",
        "ADDED 2026-07-29: woman's extra half credit point (2.75 total = ₪7,986/yr) is now a field, not just prose.",
      ],
      ownerReviewed: true,
      ownerReviewedAt: "2026-07-29",
      capturedAt: "2026-07-05",
    },
  },
  CAPITAL_GAINS: {
    realGainIndividualPct: 25,
    substantialShareholderPct: 30,
    meta: {
      sources: ["https://www.kolzchut.org.il/he/%D7%9E%D7%A1_%D7%A8%D7%95%D7%95%D7%97%D7%99_%D7%94%D7%95%D7%9F"],
      notes: ["Stable statutory rates (real gain); surtax may apply above the yesef threshold"],
      ownerReviewed: true,
      ownerReviewedAt: "2026-07-29",
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
      ownerReviewed: true,
      ownerReviewedAt: "2026-07-29",
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
      ownerReviewed: true,
      ownerReviewedAt: "2026-07-29",
      capturedAt: "2026-07-05",
    },
  },
  BITUACH_LEUMI: {
    reducedRateMonthlyThresholdILS: 7_703,
    monthlyIncomeCeilingILS: 51_910,
    /**
     * COMBINED employee deduction: bituach leumi + health tax (מס בריאות), which is what
     * a payslip actually withholds and therefore what a net-of-payroll model needs.
     *
     *   4.27% / 12.17%  = the combined deduction, and it decomposes exactly:
     *       bituach leumi  1.04% / 7.00%
     *     + health tax     3.23% / 5.17%
     *
     * The `3.50% / 12.00%` pair that appears widely is the PRE-2025 combined rate — BL's
     * reduced band was 0.40% before Jan 2025. It is NOT "bituach leumi alone", and this
     * comment previously said it was, while the values below already said otherwise.
     * Reconciled against a real 2025 form 106 to within 4 ILS; see the notes and
     * packages/registry/test/bituach-leumi-rates.test.ts, which pins the decomposition.
     */
    employeeRates: {
      reducedPct: 4.27,
      fullPct: 12.17,
      bituachLeumiOnly: { reducedPct: 1.04, fullPct: 7.0 },
      healthTax: { reducedPct: 3.23, fullPct: 5.17 },
    },
    meta: {
      sources: [
        "https://www.btl.gov.il/Insurance/Rates/Pages/default.aspx",
        "https://www.malam-payroll.com/national-insurance-updates-for-2026/",
      ],
      notes: [
        "Thresholds verified: reduced-rate portion up to ₪7,703/mo; ceiling ₪51,910/mo (2026)",
        "Employee rates RESOLVED 2026-07-28, CORRECTED 2026-07-29. 4.27% / 12.17% is the COMBINED deduction and decomposes exactly: bituach leumi 1.04% / 7.00% + health tax 3.23% / 5.17%. The 3.5% / 12.0% pair seen in older sources is the PRE-2025 combined rate (BL reduced was 0.40% before Jan 2025), NOT bituach leumi alone — seeding it as BL-only overstated the reduced band 3.4x.",
        "RECONCILED against a real 2025 form 106 (figures not stored here): on a BL-liable base of 608,338 with a 7,522/mo reduced threshold, these rates predict BL 37,204 (actual 37,200) and health tax 29,699 (actual 29,696) — both within 4 ILS. This is the arithmetic proof the decomposition is right.",
        "BTL confirms no change in rates from 2025 to 2026",
        "Owner cross-check available from his 2025 form 106 (not stored here — public-repo rule)",
      ],
      ownerReviewed: true,
      ownerReviewedAt: "2026-07-29",
      capturedAt: "2026-07-28",
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
      ownerReviewed: true,
      ownerReviewedAt: "2026-07-29",
      capturedAt: "2026-07-05",
    },
  },
} as const;
