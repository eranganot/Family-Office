import type {
  OpportunityFinding,
  OpportunityFxRate,
  OpportunityInput,
  OpportunityTxn,
} from "./types";

/**
 * M40c — implicit FX conversion spread.
 *
 * A conversion spread is the one household cost that is never billed as a line. The
 * institution applies a worse rate than the published one and keeps the difference, so
 * it appears on no statement and in no category view. The only way to see it is to
 * reconstruct the rate that was actually applied and compare it with the reference
 * rate for the day the transaction was booked.
 *
 * ---------------------------------------------------------------------------
 * WHICH TWO NUMBERS (this is not the pair the milestone plan assumed)
 * ---------------------------------------------------------------------------
 * M40's plan specified `amountBase / amount`. That is wrong for this schema, and
 * silently so. The PDF adapter deliberately stores the CHARGE in `amount` — "the
 * charge is what hits the account" — so for a foreign purchase `amount` and
 * `amountBase` are both the ILS figure and their ratio is exactly 1. The foreign side
 * lives in `originalAmount` / `originalCurrency`:
 *
 *     amountBase      = -29.79 ILS   (the charge)
 *     originalAmount  =  10.00       (the transaction)
 *     originalCurrency = "USD"
 *     implied rate    = 29.79 / 10.00 = 2.979 ILS per USD
 *
 * `originalCurrency` is load-bearing rather than decorative. The same `originalAmount`
 * column also holds an Israeli instalment plan's סכום עסקה, in ILS — a ₪1,200 purchase
 * charged at ₪100 this month. Divide that pair without checking the currency and the
 * analyzer reports a 92% "conversion markup" on an ordinary instalment. Currency is
 * what separates the two cases, which is why M40c adds the column rather than
 * inferring foreign-ness from the numbers.
 *
 * ---------------------------------------------------------------------------
 * WHY THE `other.unclassified` TRAP DOES NOT BITE HERE
 * ---------------------------------------------------------------------------
 * STATUS.md requires every new analyzer to answer this, because `other.unclassified`
 * carries `defaultBehavioralClass: "VARIABLE_DISCRETIONARY"`, making an unclassified
 * row indistinguishable from a discretionary one. This analyzer never reads
 * `behavioral` to decide what is IN: eligibility is currency and arithmetic, both
 * facts of the booking rather than of the classification, and an unclassified foreign
 * purchase carries just as real a spread. `behavioral` is read for exactly one
 * purpose — pushing `FINANCIAL_DRAG` rows OUT — which is a conservative exclusion and
 * therefore stays safe even when the class is wrong or missing.
 *
 * ---------------------------------------------------------------------------
 * FIVE DELIBERATE REFUSALS
 * ---------------------------------------------------------------------------
 *  1. OUTFLOWS ONLY. Paying more base per unit of foreign currency is a loss; for an
 *     inbound conversion the arithmetic inverts. Averaging the two together would let
 *     an incoming wire cancel out real card spread.
 *  2. NO HINDSIGHT RATES. Only a reference rate published ON or BEFORE `bookedAt` is
 *     eligible. Benchmarking against the next day's rate manufactures a markup out of
 *     ordinary drift.
 *  3. REFUSE ON THIN COVERAGE. Below `minCoveragePct` the analyzer emits NOTHING.
 *     Owner decision, 2026-07-29: refuse-and-report rather than publish a figure built
 *     on a fraction of the rows with a quietly lowered confidence score. Rows imported
 *     before the `originalCurrency` column existed land here, which is the honest
 *     outcome — they do not record what currency they were in.
 *  4. `FINANCIAL_DRAG` ROWS EXCLUDED. An explicit conversion fee booked as its own
 *     line is already counted by the leakage analyzer; its own second-order spread is
 *     negligible. Including it would let one shekel be reported on two cards.
 *  5. NO SPREAD INVENTED FOR A MISSING RATE. A row with no reference rate is counted
 *     as unpriced, never as zero markup — zero would drag the weighted average down
 *     and report a better rate than was actually paid.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Rates published within this many days before `bookedAt` are usable. */
const RATE_STALENESS_DAYS = 7;
const DAY_MS = 86_400_000;

/** Midnight UTC — `FxRate.asOf` is a DATE column, so times must not enter the compare. */
const dayOf = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Deterministic source preference. The Bank of Israel rate is the published legal
 * reference, so it wins; anything else is ordered by name so two runs over the same
 * data can never disagree about which benchmark was used.
 */
function preferSource(a: OpportunityFxRate, b: OpportunityFxRate): number {
  if (a.source === b.source) return 0;
  if (a.source === "BOI") return -1;
  if (b.source === "BOI") return 1;
  return a.source.localeCompare(b.source);
}

/**
 * The reference rate in force for `currency → base` on `bookedAt`: the most recent
 * publication at or before that day, within the staleness window. Returns null rather
 * than reaching forward or extrapolating — refusals 2 and 5.
 */
export function referenceRateOn(
  rates: readonly OpportunityFxRate[],
  currency: string,
  base: string,
  bookedAt: Date,
): OpportunityFxRate | null {
  const target = dayOf(bookedAt);
  const floor = target - RATE_STALENESS_DAYS * DAY_MS;
  const eligible = rates.filter(
    (r) =>
      r.from === currency &&
      r.to === base &&
      r.rate > 0 &&
      dayOf(r.asOf) <= target &&
      dayOf(r.asOf) >= floor,
  );
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => dayOf(b.asOf) - dayOf(a.asOf) || preferSource(a, b));
  return eligible[0]!;
}

/**
 * Rows whose spread is measurable IN PRINCIPLE — the coverage denominator.
 *
 * A row counts as a conversion candidate only when it records a foreign original.
 * A row with `originalCurrency === null` is NOT a candidate: it is not a conversion
 * that failed to price, it is a row that never claimed to be one. Counting every
 * domestic purchase as an unpriced conversion would push coverage to near zero and
 * suppress the card permanently.
 */
function isConversionCandidate(t: OpportunityTxn, base: string): boolean {
  return (
    t.status === "BOOKED" &&
    t.originalCurrency !== null &&
    t.originalCurrency !== base &&
    t.originalAmount !== null &&
    t.originalAmount !== 0 &&
    // Refusal 1 — outgoing conversions only.
    t.amountBase !== null &&
    t.amountBase < 0 &&
    // Refusal 4 — an explicit conversion fee belongs to the leakage card.
    t.behavioral !== "FINANCIAL_DRAG"
  );
}

interface PricedRow {
  txn: OpportunityTxn;
  currency: string;
  /** Base currency actually paid, absolute. */
  paidBase: number;
  /** Base currency the reference rate implies, absolute. */
  referenceBase: number;
  impliedRate: number;
  referenceRate: number;
  source: string;
}

export interface FxPricingResult {
  priced: PricedRow[];
  candidates: number;
  unpricedNoRate: number;
}

export function priceFxRows(input: OpportunityInput): FxPricingResult {
  const base = input.baseCurrency;
  const candidates = input.transactions.filter((t) => isConversionCandidate(t, base));

  const priced: PricedRow[] = [];
  let unpricedNoRate = 0;

  for (const t of candidates) {
    const ref = referenceRateOn(input.fxRates, t.originalCurrency!, base, t.bookedAt);
    if (ref === null) {
      unpricedNoRate += 1;
      continue;
    }
    const foreign = Math.abs(t.originalAmount!);
    const paidBase = Math.abs(t.amountBase!);
    priced.push({
      txn: t,
      currency: t.originalCurrency!,
      paidBase,
      referenceBase: foreign * ref.rate,
      impliedRate: paidBase / foreign,
      referenceRate: ref.rate,
      source: ref.source,
    });
  }

  return { priced, candidates: candidates.length, unpricedNoRate };
}

export function analyzeFxMarkup(input: OpportunityInput): OpportunityFinding[] {
  const { assumptions } = input;
  const { priced, candidates, unpricedNoRate } = priceFxRows(input);
  if (candidates === 0 || priced.length === 0) return [];

  // Refusal 3 — refuse-and-report-coverage. A spread computed from a minority of the
  // household's foreign spend is a real number describing an unrepresentative subset,
  // which is the most convincing kind of wrong.
  const coveragePct = round2((priced.length / candidates) * 100);
  if (coveragePct < assumptions.minCoveragePct) return [];

  const totalPaid = priced.reduce((s, p) => s + p.paidBase, 0);
  const totalReference = priced.reduce((s, p) => s + p.referenceBase, 0);
  if (totalReference <= 0) return [];

  const excessBase = round2(totalPaid - totalReference);
  // Value-weighted, not row-averaged: one large conversion at a poor rate costs more
  // than ten small ones, and a per-row mean would hide exactly that.
  const markupPct = round2((excessBase / totalReference) * 100);
  if (markupPct <= assumptions.fxMarkupNoticePct) return [];

  // Observed span, so the monthly figure is a rate rather than a total over an
  // arbitrary window. Same window discipline as the leakage analyzer.
  const days = priced.map((p) => dayOf(p.txn.bookedAt));
  const spanDays = Math.max(1, (Math.max(...days) - Math.min(...days)) / DAY_MS + 1);
  const monthlyBase = round2((excessBase / spanDays) * 30);

  // Materiality floor (M40b): a spread costing a few shekels a month does not earn
  // four action steps.
  if (monthlyBase < assumptions.minMonthlyBase) return [];

  const byCurrency = new Map<string, { excess: number; reference: number; count: number }>();
  for (const p of priced) {
    const c = byCurrency.get(p.currency) ?? { excess: 0, reference: 0, count: 0 };
    c.excess += p.paidBase - p.referenceBase;
    c.reference += p.referenceBase;
    c.count += 1;
    byCurrency.set(p.currency, c);
  }
  const currencies = [...byCurrency.entries()]
    .sort((a, b) => b[1].excess - a[1].excess)
    .map(
      ([c, v]) => `${c}:${round2(v.excess)}(${round2((v.excess / Math.max(v.reference, 1)) * 100)}%)`,
    )
    .join(", ");

  const worst = [...priced].sort(
    (a, b) => b.paidBase - b.referenceBase - (a.paidBase - a.referenceBase),
  )[0]!;

  return [
    {
      code: "OPERATIONAL_FX_MARKUP_ABOVE_NOTICE",
      severity: markupPct >= assumptions.fxMarkupNoticePct * 2 ? "WARNING" : "NOTICE",
      metrics: {
        markupPct,
        thresholdPct: assumptions.fxMarkupNoticePct,
        excessBase,
        monthlyExcessBase: monthlyBase,
        annualExcessBase: round2(monthlyBase * 12),
        convertedVolumeBase: round2(totalReference),
        rowsPriced: priced.length,
        rowsCandidate: candidates,
        coveragePct,
        minCoveragePct: assumptions.minCoveragePct,
        unpricedNoRate,
        spanDays: Math.round(spanDays),
        currencies,
        benchmarkSource: worst.source,
        worstCurrency: worst.currency,
        worstImpliedRate: round2(worst.impliedRate),
        worstReferenceRate: round2(worst.referenceRate),
      },
      evidenceItemIds: [],
    },
  ];
}
