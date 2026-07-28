import {
  foldHebrewFinals,
  MERCHANT_RULES,
  MERCHANT_RULES_VERSION,
  UNCLASSIFIED_KEY,
  type BehavioralClassKey,
  type MerchantRule,
} from "@wealthos/domain";
import { normalizeMerchantKey } from "./merchant-key";

export type ClassificationMethod = "OWNER" | "CARRIED_FORWARD" | "RULE" | "FALLBACK";

export interface ClassificationResult {
  categoryKey: string;
  behavioral: BehavioralClassKey;
  /** 0..1 */
  confidence: number;
  method: ClassificationMethod;
  ruleVersion: string;
  /** True when confidence is below the registry threshold -> Suspense Queue. */
  suspense: boolean;
  /** Which rule fired, for "why was this categorised this way". */
  ruleId?: string | undefined;
  merchantKey: string;
}

export interface ClassifyInput {
  descriptionRedacted: string;
  /** Pre-computed key; recomputed from the description when absent. */
  merchantKey?: string | undefined;
}

export interface ClassifyOptions {
  /**
   * Owner-confirmed memory: merchantKey -> decision. Built from existing CONFIRMED
   * classifications. This is how the system "learns" with no model: once you correct
   * a merchant, every future transaction from it follows, at full confidence.
   */
  ownerMemory?: ReadonlyMap<string, { categoryKey: string; behavioral: BehavioralClassKey }> | undefined;
  /** `operations_classification_min_confidence` from the AssumptionRegistry. */
  minConfidence: number;
}

/** Patterns are authored naturally; compiled through the same folding as merchant keys. */
function compilePattern(p: string): string {
  return foldHebrewFinals(p.toUpperCase()).replace(/\s+/g, "_");
}

interface CompiledRule extends MerchantRule {
  compiled: string;
}

let COMPILED: CompiledRule[] | null = null;
function compiledRules(): CompiledRule[] {
  COMPILED ??= MERCHANT_RULES.map((r) => ({ ...r, compiled: compilePattern(r.match) }));
  return COMPILED;
}

/**
 * Classify one transaction along both axes.
 *
 * Precedence, highest first:
 *   1. OWNER      — the household confirmed this merchant before. Always wins, even
 *                   over a higher-confidence rule, and even after a rules version bump.
 *   2. RULE       — first matching rule in MERCHANT_RULES (ordered, specific first).
 *   3. FALLBACK   — Other/Unclassified at confidence 0.
 *
 * Deterministic and pure: same input + same options => same output, which is what makes
 * a classification reproducible from a snapshot (owner decision D3, no LLM).
 *
 * NOTE: a sub-threshold result is still RETURNED with its category pre-filled — the
 * caller routes it to Suspense but the amount is still counted (the non-blocking rule).
 * Suspense means "unconfirmed", never "ignored".
 */
export function classify(input: ClassifyInput, opts: ClassifyOptions): ClassificationResult {
  const merchantKey = input.merchantKey ?? normalizeMerchantKey(input.descriptionRedacted);

  const owned = merchantKey ? opts.ownerMemory?.get(merchantKey) : undefined;
  if (owned) {
    return {
      categoryKey: owned.categoryKey,
      behavioral: owned.behavioral,
      confidence: 1,
      method: "OWNER",
      ruleVersion: MERCHANT_RULES_VERSION,
      suspense: false,
      merchantKey,
    };
  }

  if (merchantKey) {
    /**
     * Highest CONFIDENCE wins, not first-in-the-array.
     *
     * Rule order used to decide, which meant a broad low-confidence rule could beat a
     * specific high-confidence one purely by sitting earlier. Real case: "העברה משכורת"
     * matched the generic transfer rule (0.6) before the salary rule (0.95) and was
     * booked as a TRANSFER — and transfers are excluded from BOTH income and expenses,
     * so an entire salary vanished from the month's totals with no error anywhere.
     *
     * Confidence already encodes specificity, so using it as the tiebreak makes rule
     * ordering irrelevant and removes a whole class of silent mis-classification.
     * Ties keep array order, so deliberate ordering still works where it matters.
     */
    let best: CompiledRule | undefined;
    for (const rule of compiledRules()) {
      const hit = rule.re
        ? new RegExp(rule.compiled).test(merchantKey)
        : merchantKey.includes(rule.compiled);
      if (!hit) continue;
      if (!best || rule.confidence > best.confidence) best = rule;
    }
    if (best) {
      return {
        categoryKey: best.categoryKey,
        behavioral: best.behavioral,
        confidence: best.confidence,
        method: "RULE",
        ruleVersion: MERCHANT_RULES_VERSION,
        suspense: best.confidence < opts.minConfidence,
        ruleId: best.id,
        merchantKey,
      };
    }
  }

  return {
    categoryKey: UNCLASSIFIED_KEY,
    behavioral: "VARIABLE_DISCRETIONARY",
    confidence: 0,
    method: "FALLBACK",
    ruleVersion: MERCHANT_RULES_VERSION,
    suspense: true,
    merchantKey,
  };
}

/**
 * Income/expense sanity: a rule can only be trusted about DIRECTION when it agrees with
 * the sign of the amount. A "משכורת" line that is an OUTFLOW is not salary — most likely
 * a salary-related payment out. Rather than mis-book it, drop the confidence so it lands
 * in Suspense for the owner to decide.
 */
export function reconcileWithSign(
  result: ClassificationResult,
  signedAmount: number,
  isIncomeCategory: (categoryKey: string) => boolean,
  minConfidence: number,
): ClassificationResult {
  if (result.method === "OWNER") return result;
  const looksIncome = isIncomeCategory(result.categoryKey);
  const isInflow = signedAmount > 0;
  if (looksIncome === isInflow) return result;
  const confidence = Math.min(result.confidence, minConfidence - 0.01);
  return { ...result, confidence, suspense: true };
}
