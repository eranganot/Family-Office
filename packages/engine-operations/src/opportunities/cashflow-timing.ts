import type { OpportunityCalendarEvent, OpportunityFinding, OpportunityInput } from "./types";

/**
 * M40c — cash-flow timing: committed outflows that cluster into one month.
 *
 * Every other analyzer here asks "is this money worth spending at all". This one
 * accepts the spending as given and asks a different question: does it all land in
 * the same month? A household whose annual insurance renewal, arnona instalment and
 * school payment happen to share a due date can be perfectly solvent across the year
 * and still be forced into an overdraft — or into selling something — in one month.
 * Nothing is saved by moving a payment; what changes is whether it can be met from
 * income instead of from a facility or an asset sale.
 *
 * ---------------------------------------------------------------------------
 * THE REFUSAL THAT DEFINES THIS ANALYZER: A STATUTORY DATE DOES NOT MOVE
 * ---------------------------------------------------------------------------
 * A tax or bituach-leumi date is externally imposed. Proposing to shift it is not a
 * strategy, it is bad advice with a penalty attached. So the spike is split into a
 * movable part (household-scheduled) and an immovable part (statutory), and **if the
 * whole spike is statutory the analyzer emits NOTHING** — a card that tells the owner
 * September is expensive while offering no action he is permitted to take is noise
 * that trains him to ignore the inbox. Same reasoning that keeps `deadlines.ts` from
 * merging statutory dates with household reviews.
 *
 * ---------------------------------------------------------------------------
 * OTHER DELIBERATE REFUSALS
 * ---------------------------------------------------------------------------
 *  - A cash-impacting event with no `amountBase` is counted as UNPRICED, never as
 *    zero. Treating it as zero would flatten the very peak this analyzer exists to
 *    find. Below `minCoveragePct` the finding is withheld entirely.
 *  - Fewer than three months of forward calendar produces no finding. With two
 *    months there is a bigger one and a smaller one but no "typical" month to be
 *    unusual against, and calling the larger of two a spike is arithmetic, not
 *    evidence.
 *  - The partial month at the end of the horizon is dropped. It looks cheap purely
 *    because it is short, and would drag the typical-month baseline down and
 *    manufacture a spike everywhere else.
 */

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;

const startOfUtcDay = (d: Date): number =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const monthKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

const isStatutory = (e: OpportunityCalendarEvent): boolean => e.sourceNote === "STATUTORY";

interface MonthBucket {
  key: string;
  total: number;
  movable: number;
  statutory: number;
  events: OpportunityCalendarEvent[];
}

export function bucketCommittedByMonth(
  events: readonly OpportunityCalendarEvent[],
): MonthBucket[] {
  const byMonth = new Map<string, MonthBucket>();
  for (const e of events) {
    const key = monthKey(e.dueDate);
    const b =
      byMonth.get(key) ?? { key, total: 0, movable: 0, statutory: 0, events: [] };
    const amount = Math.abs(e.amountBase ?? 0);
    b.total += amount;
    if (isStatutory(e)) b.statutory += amount;
    else b.movable += amount;
    b.events.push(e);
    byMonth.set(key, b);
  }
  return [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function analyzeCashflowTiming(input: OpportunityInput): OpportunityFinding[] {
  const { asOf, assumptions, calendarEvents } = input;
  const horizon = assumptions.cashflowHorizonDays;
  const from = startOfUtcDay(asOf);
  const to = from + horizon * DAY_MS;

  const inHorizon = calendarEvents.filter((e) => {
    const due = startOfUtcDay(e.dueDate);
    return e.isCashImpacting && due >= from && due <= to;
  });
  if (inHorizon.length === 0) return [];

  // Coverage first: an unpriced obligation is exactly the kind of thing that would
  // have made the peak month the peak month.
  const priced = inHorizon.filter((e) => e.amountBase !== null);
  const unpriced = inHorizon.length - priced.length;
  const coveragePct = round2((priced.length / inHorizon.length) * 100);
  if (coveragePct < assumptions.minCoveragePct) return [];
  if (priced.length === 0) return [];

  const buckets = bucketCommittedByMonth(priced);

  // Drop the trailing partial month — it is short, not cheap. Keeping it would pull
  // the typical-month figure down and make every other month look like a spike.
  const lastFullMonthKey = monthKey(new Date(to - 31 * DAY_MS));
  const complete = buckets.filter((b) => b.key <= lastFullMonthKey);
  if (complete.length < 3) return [];

  const peak = complete.reduce((a, b) => (b.total > a.total ? b : a));
  const others = complete.filter((b) => b.key !== peak.key);
  const typical = others.reduce((s, b) => s + b.total, 0) / others.length;
  if (typical <= 0) return [];

  const excess = round2(peak.total - typical);
  const spikePct = round2((excess / typical) * 100);
  if (spikePct <= assumptions.cashflowPeakNoticePct) return [];
  if (excess < assumptions.minMonthlyBase) return [];

  // THE refusal. Nothing here can be moved, so there is no action to propose.
  if (peak.movable <= 0) return [];

  const movableEvents = peak.events
    .filter((e) => !isStatutory(e) && e.amountBase !== null)
    .sort((a, b) => Math.abs(b.amountBase ?? 0) - Math.abs(a.amountBase ?? 0));
  if (movableEvents.length === 0) return [];

  const lightest = complete.reduce((a, b) => (b.total < a.total ? b : a));

  return [
    {
      code: "OPERATIONAL_CASHFLOW_TIMING_SPIKE",
      // The spike is only a WARNING when the movable part alone would clear it —
      // i.e. the owner can actually fix it, rather than merely soften it.
      severity: peak.movable >= excess ? "WARNING" : "NOTICE",
      metrics: {
        peakMonth: peak.key,
        peakMonthBase: round2(peak.total),
        typicalMonthBase: round2(typical),
        excessBase: excess,
        spikePct,
        thresholdPct: assumptions.cashflowPeakNoticePct,
        movableBase: round2(peak.movable),
        statutoryBase: round2(peak.statutory),
        movableCount: movableEvents.length,
        largestMovableEn: movableEvents[0]!.titleEn,
        largestMovableHe: movableEvents[0]!.titleHe,
        largestMovableBase: round2(Math.abs(movableEvents[0]!.amountBase ?? 0)),
        movableTitlesEn: movableEvents.slice(0, 4).map((e) => e.titleEn).join(" · "),
        movableTitlesHe: movableEvents.slice(0, 4).map((e) => e.titleHe).join(" · "),
        lightestMonth: lightest.key,
        lightestMonthBase: round2(lightest.total),
        monthsObserved: complete.length,
        horizonDays: horizon,
        coveragePct,
        minCoveragePct: assumptions.minCoveragePct,
        unpricedEvents: unpriced,
      },
      evidenceItemIds: [],
    },
  ];
}
