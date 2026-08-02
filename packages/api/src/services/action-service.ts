import type { PrismaClient } from "@wealthos/db";
import type { EoyProjection } from "@wealthos/engine-operations";
import { listOpportunities } from "./opportunity-service";
import { eoyProjection } from "./projection-service";

/**
 * M40c — the Action Center.
 *
 * WHAT THIS VIEW IS, AND WHY IT IS NOT A THIRD INBOX.
 *
 * WealthOS already has two PROPOSAL inboxes, kept apart by `origin`: the strategy
 * inbox and the Opportunity Center. Adding a third list of proposals would just give
 * the owner somewhere else to not decide. So the Action Center is defined by STATUS,
 * not by origin: it is everything he has already committed to, from either engine, as
 * one worklist. Deciding happens in the inboxes; doing happens here.
 *
 * That definition is also why it deliberately crosses the origin partition. The
 * partition exists so one engine's run cannot supersede the other's proposals — it was
 * never about hiding one engine's accepted work from the other's view. A household has
 * one Saturday morning, and the work competes for it regardless of which engine
 * proposed it.
 *
 * THE FOUR STATES map onto the existing lifecycle rather than duplicating it:
 *
 *   PENDING      status ACCEPTED,    actionStartedAt null
 *   IN_PROGRESS  status ACCEPTED,    actionStartedAt set
 *   COMPLETED    status IMPLEMENTED
 *   DISMISSED    status REJECTED
 *
 * Every transition writes an `ActionEvent` (from → to, reason, note, actor). That table
 * predates this milestone and already had `dismissalReason`; it was simply never
 * written to.
 */

export type ActionStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "DISMISSED";

/** The reasons the schema documents. Free text is captured separately, in `note`. */
export const DISMISSAL_REASONS = [
  "NOT_RELEVANT",
  "TOO_HARD",
  "DISAGREE",
  "ALREADY_DONE",
  "LATER",
  "OTHER",
] as const;
export type DismissalReason = (typeof DISMISSAL_REASONS)[number];

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export interface ActionCardView {
  id: string;
  type: string;
  title: string;
  titleHe: string | null;
  origin: string;
  actionStatus: ActionStatus;
  cadence: string;
  difficulty: string | null;
  reversibility: string | null;
  priorityScore: number;
  impactMonthlyBase: number | null;
  impactAnnualBase: number | null;
  dueDate: string | null;
  expiresAt: string | null;
  startedAt: string | null;
  actionItems: unknown;
  /** M40c — a prerequisite of this action is still outstanding. */
  isBlocked: boolean;
  blockedByEn: string[];
  blockedByHe: string[];
}

function deriveActionStatus(status: string, actionStartedAt: Date | null): ActionStatus {
  if (status === "IMPLEMENTED") return "COMPLETED";
  if (status === "REJECTED") return "DISMISSED";
  return actionStartedAt === null ? "PENDING" : "IN_PROGRESS";
}

/** Statuses that belong in a worklist. PROPOSED is a decision, not a task. */
const ACTIONABLE = ["ACCEPTED", "IMPLEMENTED", "REJECTED"] as const;

/**
 * M42 QA: closed items are now shown BY DEFAULT.
 *
 * They were hidden, so marking an action done made it vanish — and the undo control
 * vanished with it. "Mark done" became irreversible from the screen, which is the exact
 * one-way-door the M40c un-accept control was added to remove, reintroduced one layer
 * up. A worklist that silently swallows completed work also gives the owner no way to
 * see what he actually got through.
 *
 * Open items sort first (below), so the list still leads with what needs doing.
 */
export async function listActions(
  db: PrismaClient,
  householdId: string,
  opts: { includeClosed?: boolean } = {},
): Promise<{ items: ActionCardView[]; openCount: number; blockedCount: number }> {
  const statuses = opts.includeClosed === false ? ["ACCEPTED"] : [...ACTIONABLE];
  const rows = await db.recommendation.findMany({
    where: { householdId, status: { in: statuses as never } },
    orderBy: [{ priorityScore: "desc" }, { generatedAt: "desc" }],
  });

  // Same blocking rule as the Opportunity Center: a prerequisite only blocks while it
  // is still outstanding. Once it is done, rejected or superseded the dependent is
  // free — otherwise it would be stranded behind an item already dealt with.
  const ids = rows.map((r) => r.id);
  const edges = ids.length
    ? await db.recommendationDependency.findMany({
        where: { dependentId: { in: ids } },
        select: {
          dependentId: true,
          prerequisite: { select: { title: true, titleHe: true, status: true } },
        },
      })
    : [];
  const blockers = new Map<string, Array<{ title: string; titleHe: string | null }>>();
  for (const e of edges) {
    if (e.prerequisite.status !== "PROPOSED" && e.prerequisite.status !== "ACCEPTED") continue;
    const list = blockers.get(e.dependentId) ?? [];
    list.push({ title: e.prerequisite.title, titleHe: e.prerequisite.titleHe });
    blockers.set(e.dependentId, list);
  }

  const items: ActionCardView[] = rows.map((r) => {
    const blocking = blockers.get(r.id) ?? [];
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      titleHe: r.titleHe,
      origin: r.origin,
      actionStatus: deriveActionStatus(r.status, r.actionStartedAt),
      cadence: r.cadence,
      difficulty: r.difficulty,
      reversibility: r.reversibility,
      priorityScore: num(r.priorityScore),
      impactMonthlyBase: r.impactMonthlyBase === null ? null : num(r.impactMonthlyBase),
      impactAnnualBase: r.impactAnnualBase === null ? null : num(r.impactAnnualBase),
      dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : null,
      startedAt: r.actionStartedAt ? r.actionStartedAt.toISOString() : null,
      actionItems: r.actionItems,
      isBlocked: blocking.length > 0,
      blockedByEn: blocking.map((b) => b.title),
      blockedByHe: blocking.map((b) => b.titleHe ?? b.title),
    };
  });

  // Open work first, then completed, then dismissed — the list leads with what still
  // needs doing while keeping finished items reachable for undo.
  const rank: Record<ActionStatus, number> = {
    IN_PROGRESS: 0,
    PENDING: 1,
    COMPLETED: 2,
    DISMISSED: 3,
  };
  items.sort((a, b) => rank[a.actionStatus] - rank[b.actionStatus]);

  return {
    items,
    openCount: items.filter((i) => i.actionStatus === "PENDING" || i.actionStatus === "IN_PROGRESS")
      .length,
    blockedCount: items.filter((i) => i.isBlocked).length,
  };
}

export interface SetActionStatusResult {
  id: string;
  actionStatus: ActionStatus;
  /**
   * Recomputed in the SAME response, as doc 07 §8 requires. Completing an action
   * changes the Opportunity Center totals immediately (an accepted saving stops
   * counting as still-available).
   */
  totals: { monthlyBase: number; annualBase: number };
  /**
   * M41 closes the seam M40c left open here. This used to be a hard-coded null with an
   * `eoyUnavailableReason`, because approximating a forecast with no forecaster behind
   * it is the confident-wrong number this module keeps removing. The projection engine
   * now exists — and it still returns `ok: false` with a REASON when there are too few
   * closed months, which is the same refusal expressed by something entitled to make it.
   */
  eoyProjection: EoyProjection;
}

export async function setActionStatus(
  db: PrismaClient,
  householdId: string,
  input: {
    id: string;
    status: ActionStatus;
    dismissalReason?: DismissalReason | undefined;
    note?: string | undefined;
  },
  actor: string,
): Promise<SetActionStatusResult> {
  const existing = await db.recommendation.findUnique({
    where: { id: input.id },
    select: { householdId: true, status: true, actionStartedAt: true },
  });
  if (!existing || existing.householdId !== householdId) {
    throw new Error("ACTION_NOT_FOUND");
  }
  // A dismissal without a reason is the one transition that destroys information: six
  // months later "why did I skip this" has no answer, and the engine will re-propose it.
  if (input.status === "DISMISSED" && !input.dismissalReason) {
    throw new Error("DISMISSAL_REASON_REQUIRED");
  }

  const toStatus =
    input.status === "COMPLETED"
      ? "IMPLEMENTED"
      : input.status === "DISMISSED"
        ? "REJECTED"
        : "ACCEPTED";

  // Re-starting a completed action clears the old start time; re-opening keeps history
  // in ActionEvent rather than in the row, which is why the row can be plain.
  const actionStartedAt =
    input.status === "IN_PROGRESS" ? (existing.actionStartedAt ?? new Date()) : null;

  await db.$transaction(async (tx) => {
    await tx.recommendation.update({
      where: { id: input.id },
      data: { status: toStatus as never, actionStartedAt },
    });
    await tx.actionEvent.create({
      data: {
        householdId,
        recommendationId: input.id,
        fromStatus: existing.status,
        toStatus: toStatus as never,
        dismissalReason: input.dismissalReason ?? null,
        note: input.note ?? null,
        actor,
      },
    });
  });

  // Both recomputed AFTER the transaction commits, so the response reflects the change
  // the owner just made rather than the state that preceded it.
  const [{ totalMonthlyBase, totalAnnualBase }, projection] = await Promise.all([
    listOpportunities(db, householdId),
    eoyProjection(db, householdId),
  ]);

  return {
    id: input.id,
    actionStatus: input.status,
    totals: { monthlyBase: totalMonthlyBase, annualBase: totalAnnualBase },
    eoyProjection: projection,
  };
}
