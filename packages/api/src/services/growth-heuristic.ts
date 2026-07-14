/**
 * Growth-share heuristic (M14c): suggests a growth-asset share (0-100) for an
 * account from its track name and account type. Suggestions are ESTIMATES —
 * they are stored with growthShareEstimated=true and count as data the owner
 * still needs to confirm. Where there is no reasonable basis (e.g., a brokerage
 * account that could hold anything) the heuristic returns null: never guess.
 *
 * Keyword table reflects common Israeli fund-track naming; percentages are
 * deliberately round and conservative.
 */

interface Rule {
  pattern: RegExp;
  growthPct: number;
}

// Order matters — first match wins. Patterns checked against the lowercased track name.
const TRACK_RULES: Rule[] = [
  { pattern: /מניות|מנייתי|s&p|sp\s?500|נאסד|nasdaq|msci|עולמי|חו"ל|חול/i, growthPct: 100 },
  { pattern: /כספית|כספי|שקלי טווח קצר|money market/i, growthPct: 0 },
  { pattern: /אג"ח|אגח|bond|סולידי|שקלי/i, growthPct: 10 },
  { pattern: /עד 50|לבני 50|תלוי גיל|מודל חכ"ם/i, growthPct: 55 },
  { pattern: /50\s*-\s*60|בני 50 עד 60/i, growthPct: 45 },
  { pattern: /60 ומעלה|מעל 60|לבני 60/i, growthPct: 30 },
  { pattern: /כללי/i, growthPct: 40 },
];

// Fallback by account type when the track name gives nothing. Wrappers with a
// regulated default track get the typical default-track mix; brokerages/IRA get
// NO suggestion (contents unknowable without holdings data).
const TYPE_DEFAULTS: Record<string, number> = {
  PENSION_COMPREHENSIVE: 45,
  PENSION_GENERAL: 45,
  KUPAT_GEMEL: 40,
  GEMEL_LEHASHKAA: 40,
  KEREN_HISHTALMUT: 40,
};

export function suggestGrowthShare(accountType: string, trackName: string | null): number | null {
  if (trackName) {
    for (const rule of TRACK_RULES) {
      if (rule.pattern.test(trackName)) return rule.growthPct;
    }
  }
  return TYPE_DEFAULTS[accountType] ?? null;
}
