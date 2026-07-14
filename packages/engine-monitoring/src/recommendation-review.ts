/**
 * Recommendation-review sweep (pure, B4). Finds ACCEPTED recommendations whose
 * implementation date has passed without a recorded actual outcome, so monitoring
 * can raise a gentle REVIEW nudge ("accepted in March, not marked done — still
 * relevant?"). Recommendations with no implementation date are not nagged, and one
 * that already has an outcome recorded is considered closed.
 */

export interface AcceptedRecInput {
  id: string;
  title: string;
  titleHe: string | null;
  implementationDate: Date | null;
  hasActualOutcome: boolean;
}

export interface RecReviewItem {
  id: string;
  title: string;
  titleHe: string | null;
  implementationDate: string; // ISO date
  daysOverdue: number;
}

export interface RecReviewResult {
  overdue: RecReviewItem[];
  /** Accepted recs that had a date and were therefore eligible for the check. */
  evaluated: number;
}

export function sweepRecommendationReviews(recs: AcceptedRecInput[], now: Date): RecReviewResult {
  const overdue: RecReviewItem[] = [];
  let evaluated = 0;
  for (const r of recs) {
    if (r.implementationDate === null) continue; // no target date → nothing to nag about
    evaluated += 1;
    if (r.hasActualOutcome) continue; // outcome already recorded → closed
    const daysOverdue = Math.floor((now.getTime() - r.implementationDate.getTime()) / 86_400_000);
    if (daysOverdue > 0) {
      overdue.push({
        id: r.id,
        title: r.title,
        titleHe: r.titleHe,
        implementationDate: r.implementationDate.toISOString().slice(0, 10),
        daysOverdue,
      });
    }
  }
  return { overdue, evaluated };
}
