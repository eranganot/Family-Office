import type { OpportunityFinding, OpportunityInput, OpportunityCalendarEvent } from "./types";

/**
 * M40 — upcoming-deadline analyzer.
 *
 * Turns the M39 calendar into acted-on work. A deadline differs from every other
 * opportunity in one way that drives the whole design: it EXPIRES. Missing the
 * hishtalmut ceiling on 31 December does not make the opportunity smaller, it
 * makes it zero. So each finding carries the due date forward as `expiresAt`,
 * and urgency scales with proximity rather than with amount.
 *
 * Statutory events are separated from household reviews deliberately: a missed
 * statutory date has an external, non-negotiable consequence, while a slipped
 * household review is the owner's own schedule. Merging them would flatten that
 * difference and train the owner to ignore both.
 */

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const daysUntil = (due: Date, asOf: Date): number =>
  Math.round((startOfUtcDay(due) - startOfUtcDay(asOf)) / DAY_MS);

const isStatutory = (e: OpportunityCalendarEvent): boolean => e.sourceNote === "STATUTORY";

export function analyzeDeadlines(input: OpportunityInput): OpportunityFinding[] {
  const { asOf, assumptions, calendarEvents } = input;
  const horizon = assumptions.calendarWindowDays;

  const inWindow = calendarEvents
    .map((e) => ({ e, days: daysUntil(e.dueDate, asOf) }))
    .filter(({ days }) => days >= 0 && days <= horizon)
    .sort((a, b) => a.days - b.days);

  if (inWindow.length === 0) return [];

  const findings: OpportunityFinding[] = [];

  for (const group of ["STATUTORY", "HOUSEHOLD"] as const) {
    const rows =
      group === "STATUTORY"
        ? inWindow.filter(({ e }) => isStatutory(e))
        : inWindow.filter(({ e }) => !isStatutory(e));
    if (rows.length === 0) continue;

    const nearest = rows[0]!;
    const cashImpact = round2(
      rows.reduce((s, { e }) => s + (e.isCashImpacting ? Math.abs(e.amountBase ?? 0) : 0), 0),
    );

    findings.push({
      code:
        group === "STATUTORY"
          ? "OPERATIONAL_STATUTORY_DEADLINE_NEAR"
          : "OPERATIONAL_HOUSEHOLD_REVIEW_DUE",
      // A statutory date inside 14 days is the only thing here that warrants a
      // WARNING; everything else is a NOTICE the owner schedules at will.
      severity: group === "STATUTORY" && nearest.days <= 14 ? "WARNING" : "NOTICE",
      metrics: {
        eventCount: rows.length,
        windowDays: horizon,
        nearestTitleEn: nearest.e.titleEn,
        nearestTitleHe: nearest.e.titleHe,
        nearestDueDate: nearest.e.dueDate.toISOString().slice(0, 10),
        nearestDaysAway: nearest.days,
        nearestKind: nearest.e.kind,
        cashImpactBase: cashImpact,
        titlesEn: rows.slice(0, 5).map(({ e }) => e.titleEn).join(" · "),
        titlesHe: rows.slice(0, 5).map(({ e }) => e.titleHe).join(" · "),
        /** Consumed by the service to set `Recommendation.expiresAt`. */
        expiresAtISO: nearest.e.dueDate.toISOString().slice(0, 10),
      },
      evidenceItemIds: [],
    });
  }

  return findings;
}
