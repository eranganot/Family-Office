/**
 * Israel tax matrices — tax year 2025, version 1. PENDING OWNER REVIEW.
 * Under the 2025–2027 indexation freeze, most 2025 figures equal 2026 except the
 * pre-reform income-tax bracket boundaries (the widening applies from 2026 only).
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
      notes: ["2025 pre-reform boundaries; derived from 2026 research under the indexation freeze — VERIFY on review"],
    },
  },
} as const;
