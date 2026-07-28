import type { PrismaClient } from "@wealthos/db";
import {
  HOUSEHOLD_TEMPLATE_RULES,
  IL_STATUTORY_RULES,
  occurrencesInWindow,
  type CalendarRule,
} from "@wealthos/domain";
import { projectRemainingInstalments } from "@wealthos/engine-operations";

/**
 * Financial calendar: statutory deadlines, household recurring reviews, and the
 * committed future instalments already parsed from card statements.
 *
 * Events are REGENERATED rather than accumulated: a rule change must not leave stale
 * future events behind. Only future, un-actioned, rule-generated events are replaced —
 * anything the owner has marked DONE/SKIPPED, and anything past, is left alone, because
 * that is a record of what happened rather than a projection.
 */

const DAY = 86_400_000;
const ALL_RULES: CalendarRule[] = [...IL_STATUTORY_RULES, ...HOUSEHOLD_TEMPLATE_RULES];

export interface CalendarSeedResult {
  recurringCreated: number;
  eventsCreated: number;
  instalmentEvents: number;
}

/**
 * Idempotently create the RecurringDecision rows for every default-enabled rule.
 * Never overwrites an existing row — the owner may have re-dated or paused it.
 */
export async function ensureRecurringDecisions(
  db: PrismaClient,
  householdId: string,
): Promise<number> {
  const existing = await db.recurringDecision.findMany({
    where: { householdId },
    select: { key: true },
  });
  const have = new Set(existing.map((r) => r.key));
  let created = 0;
  const now = new Date();

  for (const rule of ALL_RULES) {
    if (!rule.defaultEnabled || have.has(rule.key)) continue;
    await db.recurringDecision.create({
      data: {
        householdId,
        key: rule.key,
        titleEn: rule.titleEn,
        titleHe: rule.titleHe,
        cadence: rule.cadence === "ONE_TIME" ? "ONE_TIME" : rule.cadence,
        anchorDate: new Date(Date.UTC(now.getUTCFullYear(), (rule.month ?? 1) - 1, rule.day)),
        leadDays: rule.leadDays,
        isActive: true,
      },
    });
    created += 1;
  }
  return created;
}

/**
 * Regenerate the forward calendar for a window.
 *
 * Deletes only FUTURE, SCHEDULED, rule-generated events before regenerating, so a rule
 * or date change is reflected without duplicating, while history and owner decisions
 * survive untouched.
 */
export async function regenerateCalendar(
  db: PrismaClient,
  householdId: string,
  windowDays = 400,
): Promise<CalendarSeedResult> {
  const recurringCreated = await ensureRecurringDecisions(db, householdId);

  const now = new Date();
  const until = new Date(now.getTime() + windowDays * DAY);

  await db.calendarEvent.deleteMany({
    where: {
      householdId,
      status: "SCHEDULED",
      dueDate: { gt: now },
      ruleId: { not: null },
    },
  });

  const decisions = await db.recurringDecision.findMany({
    where: { householdId, isActive: true },
    select: { id: true, key: true, anchorDate: true, leadDays: true },
  });
  const byKey = new Map(decisions.map((d) => [d.key, d]));

  let eventsCreated = 0;
  for (const rule of ALL_RULES) {
    const decision = byKey.get(rule.key);
    if (!decision) continue; // not enabled by the owner
    // The owner's anchor date wins over the template's: it is his renewal, not ours.
    const effective: CalendarRule = {
      ...rule,
      day: decision.anchorDate.getUTCDate(),
      month: rule.cadence === "MONTHLY" ? undefined : decision.anchorDate.getUTCMonth() + 1,
      leadDays: decision.leadDays,
    };
    for (const due of occurrencesInWindow(effective, now, until)) {
      await db.calendarEvent.create({
        data: {
          householdId,
          kind: rule.kind,
          titleEn: rule.titleEn,
          titleHe: rule.titleHe,
          dueDate: due,
          windowDays: rule.leadDays,
          isCashImpacting: rule.cashImpacting,
          ruleId: rule.key,
          recurringDecisionId: decision.id,
          sourceNote: rule.origin,
        },
      });
      eventsCreated += 1;
    }
  }

  // Remaining instalments are already-committed future outflows parsed from card
  // statements. They belong in the same forward view as statutory deadlines.
  await db.calendarEvent.deleteMany({
    where: { householdId, kind: "INSTALMENT", status: "SCHEDULED", dueDate: { gt: now } },
  });
  const instalmentTxns = await db.transaction.findMany({
    where: { householdId, status: "BOOKED", instalmentTotal: { not: null } },
    select: {
      id: true, bookedAt: true, amount: true, amountBase: true,
      instalmentNumber: true, instalmentTotal: true, descriptionRedacted: true,
    },
  });
  let instalmentEvents = 0;
  for (const t of instalmentTxns) {
    const projected = projectRemainingInstalments({
      id: t.id,
      bookedAt: t.bookedAt,
      amountBase: Number(t.amountBase ?? t.amount),
      instalmentNumber: t.instalmentNumber ?? 1,
      instalmentTotal: t.instalmentTotal ?? 1,
      descriptionRedacted: t.descriptionRedacted,
    });
    for (const p of projected) {
      if (p.dueDate <= now || p.dueDate > until) continue;
      await db.calendarEvent.create({
        data: {
          householdId,
          kind: "INSTALMENT",
          titleEn: p.titleEn,
          titleHe: p.titleHe,
          dueDate: p.dueDate,
          windowDays: 7,
          amountBase: p.amountBase.toFixed(4),
          isCashImpacting: true,
          transactionId: t.id,
          sourceNote: "DERIVED",
        },
      });
      instalmentEvents += 1;
    }
  }

  return { recurringCreated, eventsCreated, instalmentEvents };
}

export interface UpcomingEvent {
  id: string;
  kind: string;
  titleEn: string;
  titleHe: string;
  dueDate: string;
  daysAway: number;
  amountBase: number | null;
  isCashImpacting: boolean;
  status: string;
  origin: string | null;
}

export async function upcomingEvents(
  db: PrismaClient,
  householdId: string,
  windowDays: number,
): Promise<{ events: UpcomingEvent[]; cashImpactBase: number }> {
  const now = new Date();
  const until = new Date(now.getTime() + windowDays * DAY);
  const rows = await db.calendarEvent.findMany({
    where: {
      householdId,
      status: { in: ["SCHEDULED", "DUE"] },
      dueDate: { gte: new Date(now.getTime() - 7 * DAY), lte: until },
    },
    orderBy: { dueDate: "asc" },
    take: 100,
  });
  const events = rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    titleEn: e.titleEn,
    titleHe: e.titleHe,
    dueDate: e.dueDate.toISOString().slice(0, 10),
    daysAway: Math.round((e.dueDate.getTime() - now.getTime()) / DAY),
    amountBase: e.amountBase === null ? null : Number(e.amountBase),
    isCashImpacting: e.isCashImpacting,
    status: e.status,
    origin: e.sourceNote,
  }));
  return {
    events,
    cashImpactBase:
      Math.round(events.filter((e) => e.isCashImpacting).reduce((n, e) => n + (e.amountBase ?? 0), 0) * 100) / 100,
  };
}
