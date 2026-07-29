/**
 * Israel tax matrices — tax year 2025, version 1. OWNER-REVIEWED 2026-07-29 (Eran).
 *
 * Under the 2025–2027 indexation freeze, most 2025 figures equal 2026 except the
 * pre-reform income-tax bracket boundaries (the widening applies from 2026 only).
 *
 * Everything inherited from IL_2026 by spread — including the non-exertion ladder, the
 * 2% capital surtax (in force from 1 Jan 2025, so it belongs to this year too) and the
 * bituach leumi decomposition — carries 2026's reviewed status. Only the four bracket
 * boundaries below differ, and only the two middle ones actually moved.
 */
import { IL_2026 } from "./il-2026";

export const IL_2025 = {
  ...IL_2026,
  INCOME_TAX_BRACKETS: {
    ...IL_2026.INCOME_TAX_BRACKETS,
    brackets: [
      { upToAnnualILS: 84_120, ratePct: 10 },
      { upToAnnualILS: 120_720, ratePct: 14 },
      { upToAnnualILS: 193_800, ratePct: 20 },  // ₪16,150/mo (pre-reform)
      { upToAnnualILS: 269_280, ratePct: 31 },  // ₪22,440/mo (pre-reform)
      { upToAnnualILS: 560_280, ratePct: 35 },
      { upToAnnualILS: null, ratePct: 47 },
    ],
    meta: {
      ...IL_2026.INCOME_TAX_BRACKETS.meta,
      notes: [
        "2025 pre-reform boundaries: only the 20% and 31% ceilings differ from 2026 (₪193,800 / ₪269,280 vs ₪228,000 / ₪301,200). The 10%, 14%, 35% and 47% boundaries are identical under the freeze.",
        "VERIFIED 2026-07-29: kolzchut states the 2025 brackets are identical to 2024 and that the widening applies from 2026 only, which is exactly the shape modelled here. The earlier 'VERIFY on review' caveat is resolved.",
        "The 2% non-exertion surtax applies from 1 Jan 2025, so it is correctly inherited into this year rather than being 2026-only.",
      ],
      ownerReviewed: true,
      ownerReviewedAt: "2026-07-29",
    },
  },
} as const;
