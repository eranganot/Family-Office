import type { SnapshotPayload } from "@wealthos/domain";
import { deriveTargetGrowthPct } from "./analyzers/allocation";
import { isCash, valued } from "./analyzers/pools";
import { validateStrategyText } from "./validator";

/**
 * M34 — strategy synthesis (Variant A: engine-generated, pinned artifact).
 *
 * Produces the household's high-level plan narrative — what it aims to achieve,
 * how it gets there, and the expected outcomes — deterministically from the same
 * inputs the recommendation engine consumes: the pinned snapshot, the derived
 * risk/target allocation, the household's APPROVED allocation plan (committed
 * moves), the funding-gap summary, and the count of generated action items.
 *
 * Engines never guess: every number here is computed (target from the risk
 * assumptions; current growth share from KNOWN-mix accounts only, cash defensive
 * by definition, unknown-mix excluded). The narrative is product-validated — it
 * describes asset-class strategy and never names a security, fund, or broker.
 * The persisted artifact carries reproducibility pins (snapshot + engine version
 * + assumption id@version), so the plan the owner reads is exactly the plan that
 * produced the action items, and it is regenerated only on a strategy run.
 */

export interface StrategyNarrativeText {
  achieve: string;
  how: string;
  outcomes: string[];
}

export interface StrategyMetrics {
  targetGrowthPct: number;
  currentGrowthPct: number | null;
  goalsTotal: number;
  goalsFunded: number;
  topGoalName: string | null;
  topGoalMonthlySavingILS: number | null;
  actionsTotal: number;
  horizonYears: number;
}

export interface CommittedMoves {
  deploysIdleCash: boolean;
  investsGrowth: boolean;
  taxDeposited: boolean;
  repaidTrackCount: number;
}

export interface FundingSummary {
  goalsTotal: number;
  goalsFunded: number;
  topGoalName: string | null;
  topGoalMonthlySavingILS: number | null;
}

export interface StrategySynthesisInput {
  snapshot: SnapshotPayload;
  assumptions: Record<string, unknown>;
  committed?: CommittedMoves | undefined;
  approvedPlanDateISO?: string | null | undefined;
  funding: FundingSummary;
  actionsTotal: number;
}

export interface StrategySynthesis {
  en: StrategyNarrativeText;
  he: StrategyNarrativeText;
  metrics: StrategyMetrics;
  /** Assumption keys the narrative consumed — resolved to id@version pins by the service. */
  assumptionKeysUsed: string[];
}

const ASSUMPTION_KEYS_USED = [
  "risk_loss_tolerance",
  "risk_income_stability",
  "risk_horizon_years",
  "risk_drawdown_reaction",
  "risk_investment_experience",
  "risk_spending_flexibility",
  "goal_projection_real_return_pct",
];

const nfEn = (n: number) => Math.round(n).toLocaleString("en-US");
const nfHe = (n: number) => Math.round(n).toLocaleString("he-IL");

/** "a, b and c" / "a, b ו-c" */
function joinEn(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
function joinHe(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ו${parts[parts.length - 1]}`;
}

/** Current growth-asset share of KNOWN-mix investable accounts (cash = defensive). */
function currentGrowthShare(snapshot: SnapshotPayload): number | null {
  const investable = valued(snapshot.items).filter((i) => i.kind === "ACCOUNT");
  let growth = 0;
  let known = 0;
  for (const i of investable) {
    const v = i.valueBase ?? 0;
    if (i.growthSharePct !== null && i.growthSharePct !== undefined) {
      growth += (v * i.growthSharePct) / 100;
      known += v;
    } else if (isCash(i)) {
      known += v; // cash is known and contributes 0 growth
    }
  }
  if (known <= 0) return null;
  return Math.round((growth / known) * 1000) / 10;
}

export function synthesizeStrategy(input: StrategySynthesisInput): StrategySynthesis {
  const { snapshot, assumptions, committed, funding, actionsTotal, approvedPlanDateISO } = input;
  const targetGrowthPct = deriveTargetGrowthPct(assumptions);
  const horizonYears = Math.max(1, Math.round(Number(assumptions["risk_horizon_years"] ?? 20)));
  const currentGrowthPct = currentGrowthShare(snapshot);

  const g = funding.goalsTotal;
  const dateEn = approvedPlanDateISO ? new Date(approvedPlanDateISO).toLocaleDateString("en-GB") : null;
  const dateHe = approvedPlanDateISO ? new Date(approvedPlanDateISO).toLocaleDateString("he-IL") : null;

  // --- what it aims to achieve ------------------------------------------------
  const achieveEn =
    g > 0
      ? `Fund your ${g} active ${g === 1 ? "goal" : "goals"} while holding a target growth allocation of ${targetGrowthPct}%, matched to your risk profile over a ${horizonYears}-year horizon.`
      : `Hold a target growth allocation of ${targetGrowthPct}% matched to your risk profile over a ${horizonYears}-year horizon, and keep the household's finances resilient.`;
  const achieveHe =
    g > 0
      ? `לממן את ${g} המטרות הפעילות שלכם תוך שמירה על הקצאת צמיחה יעד של ${targetGrowthPct}%, בהתאמה לפרופיל הסיכון שלכם על פני אופק של ${horizonYears} שנים.`
      : `לשמור על הקצאת צמיחה יעד של ${targetGrowthPct}% בהתאמה לפרופיל הסיכון שלכם על פני אופק של ${horizonYears} שנים, ולשמור על חוסן פיננסי של משק הבית.`;

  // --- how it gets there ------------------------------------------------------
  let howEn: string;
  let howHe: string;
  if (committed && (committed.deploysIdleCash || committed.investsGrowth || committed.taxDeposited || committed.repaidTrackCount > 0)) {
    const en: string[] = [];
    const he: string[] = [];
    if (committed.deploysIdleCash) {
      en.push("deploy your idle cash beyond the emergency buffer");
      he.push("להשקיע את המזומן הפנוי מעבר לכרית החירום");
    }
    if (committed.repaidTrackCount > 0) {
      en.push(`repay ${committed.repaidTrackCount} expensive mortgage ${committed.repaidTrackCount === 1 ? "track" : "tracks"}`);
      he.push(`לפרוע ${committed.repaidTrackCount} מסלולי משכנתא יקרים`);
    }
    if (committed.investsGrowth) {
      en.push("invest toward your growth target");
      he.push("להשקיע לכיוון יעד הצמיחה");
    }
    if (committed.taxDeposited) {
      en.push("use your remaining tax-advantaged headroom");
      he.push("לנצל את יתרת ההטבות המוטבות במס");
    }
    howEn = `Through the allocation plan you approved${dateEn ? ` on ${dateEn}` : ""}: ${joinEn(en)}. Then work the ${actionsTotal} action ${actionsTotal === 1 ? "item" : "items"} below.`;
    howHe = `דרך תוכנית ההקצאה שאישרתם${dateHe ? ` ב-${dateHe}` : ""}: ${joinHe(he)}. לאחר מכן לבצע את ${actionsTotal} פריטי הפעולה שמטה.`;
  } else {
    howEn = `Work through the ${actionsTotal} action ${actionsTotal === 1 ? "item" : "items"} below — each closes a specific gap the analysis found. Approve an allocation plan to add a concrete cash-deployment sequence.`;
    howHe = `לבצע את ${actionsTotal} פריטי הפעולה שמטה — כל אחד סוגר פער ספציפי שהניתוח מצא. אשרו תוכנית הקצאה כדי להוסיף רצף פעולות מוחשי לפריסת המזומן.`;
  }

  // --- expected outcomes ------------------------------------------------------
  const outcomesEn: string[] = [];
  const outcomesHe: string[] = [];
  if (currentGrowthPct !== null) {
    const diff = Math.round((targetGrowthPct - currentGrowthPct) * 10) / 10;
    if (Math.abs(diff) < 0.05) {
      outcomesEn.push(`Growth allocation is on target at ${currentGrowthPct}%.`);
      outcomesHe.push(`הקצאת הצמיחה על היעד ברמת ${currentGrowthPct}%.`);
    } else {
      outcomesEn.push(`Growth allocation moves from ${currentGrowthPct}% toward your ${targetGrowthPct}% target.`);
      outcomesHe.push(`הקצאת הצמיחה נעה מ-${currentGrowthPct}% לכיוון יעד של ${targetGrowthPct}%.`);
    }
  }
  if (g > 0) {
    outcomesEn.push(`${funding.goalsFunded} of ${g} ${g === 1 ? "goal" : "goals"} fully funded on the current trajectory.`);
    outcomesHe.push(`${funding.goalsFunded} מתוך ${g} מטרות ממומנות במלואן במסלול הנוכחי.`);
  }
  if (funding.topGoalName && funding.topGoalMonthlySavingILS && funding.topGoalMonthlySavingILS > 0) {
    outcomesEn.push(`Save about ₪${nfEn(funding.topGoalMonthlySavingILS)}/month to close the gap on "${funding.topGoalName}".`);
    outcomesHe.push(`חסכו כ-₪${nfHe(funding.topGoalMonthlySavingILS)} בחודש כדי לסגור את הפער ב"${funding.topGoalName}".`);
  }
  outcomesEn.push(`${actionsTotal} recommended action ${actionsTotal === 1 ? "item" : "items"} to work through.`);
  outcomesHe.push(`${actionsTotal} פריטי פעולה מומלצים לביצוע.`);

  const en: StrategyNarrativeText = { achieve: achieveEn, how: howEn, outcomes: outcomesEn };
  const he: StrategyNarrativeText = { achieve: achieveHe, how: howHe, outcomes: outcomesHe };

  // Strategy-level only: the narrative must never name a product/security/broker.
  const check = validateStrategyText([en.achieve, en.how, ...en.outcomes, he.achieve, he.how, ...he.outcomes]);
  if (!check.valid) {
    throw new Error(`Strategy synthesis emitted a product reference (${check.pattern}): ${check.text}`);
  }

  return {
    en,
    he,
    metrics: {
      targetGrowthPct,
      currentGrowthPct,
      goalsTotal: funding.goalsTotal,
      goalsFunded: funding.goalsFunded,
      topGoalName: funding.topGoalName,
      topGoalMonthlySavingILS: funding.topGoalMonthlySavingILS,
      actionsTotal,
      horizonYears,
    },
    assumptionKeysUsed: ASSUMPTION_KEYS_USED,
  };
}
