/**
 * Card-settlement linking and Israeli instalments (docs/architecture/07 Appendix B.3).
 *
 * The double-count hazard, in one line: the BANK statement carries a card bill as a
 * single aggregate debit ("ישראכרט בע"מ - 1069  -5,611.17") while the CARD statement
 * itemises that same money. Import both naively and every card expense counts twice.
 */

export interface SettlementCandidate {
  id: string;
  bookedAt: Date;
  /** Signed, base currency. A settlement is an outflow. */
  amountBase: number;
  merchantKey: string;
  /** Last 4 of the card, when the statement line exposes it. */
  cardLast4?: string | undefined;
}

export interface CardStatementTotal {
  /** Last 4 of the card this statement belongs to. */
  cardLast4: string;
  /** Sum of the itemised charges, base currency, positive. */
  totalBase: number;
  /** The billing date the issuer charged the bank on. */
  chargedOn: Date;
  transactionIds: string[];
}

export type SettlementOutcome =
  | { kind: "LINKED"; settlementId: string; cardLast4: string; deltaBase: number }
  | { kind: "UNRECONCILED"; settlementId: string; reason: "NO_STATEMENT" | "TOTAL_MISMATCH"; deltaBase?: number | undefined };

/** Tolerance for matching an aggregate debit to an itemised statement total. */
const ABS_TOLERANCE_BASE = 1.0;
const REL_TOLERANCE = 0.005; // 0.5%
const DATE_TOLERANCE_DAYS = 3;

const DAY_MS = 86_400_000;

/**
 * Decide, per bank-side settlement line, whether it can be safely treated as a TRANSFER.
 *
 * LINKED       -> a card statement covering that billing period reconciles within
 *                 tolerance. The bank line becomes TRANSFER (excluded from expenses)
 *                 and the itemised card rows carry the real spend.
 * UNRECONCILED -> no matching statement, or the totals disagree. The aggregate line
 *                 STANDS as the expense and the period is marked AGGREGATE_ONLY.
 *                 The month is still computable — that is the non-blocking rule applied
 *                 at the settlement level — it simply says so rather than quietly
 *                 dropping a few thousand shekels of real spending.
 */
export function reconcileSettlements(
  settlements: SettlementCandidate[],
  statements: CardStatementTotal[],
): SettlementOutcome[] {
  return settlements.map((s) => {
    const amount = Math.abs(s.amountBase);

    const sameCard = statements.filter(
      (st) => !s.cardLast4 || !st.cardLast4 || st.cardLast4 === s.cardLast4,
    );
    const nearInTime = sameCard.filter(
      (st) => Math.abs(st.chargedOn.getTime() - s.bookedAt.getTime()) <= DATE_TOLERANCE_DAYS * DAY_MS,
    );
    if (nearInTime.length === 0) {
      return { kind: "UNRECONCILED", settlementId: s.id, reason: "NO_STATEMENT" };
    }

    let best: { st: CardStatementTotal; delta: number } | null = null;
    for (const st of nearInTime) {
      const delta = Math.abs(st.totalBase - amount);
      if (!best || delta < best.delta) best = { st, delta };
    }
    if (!best) return { kind: "UNRECONCILED", settlementId: s.id, reason: "NO_STATEMENT" };

    const tolerance = Math.max(ABS_TOLERANCE_BASE, amount * REL_TOLERANCE);
    if (best.delta <= tolerance) {
      return {
        kind: "LINKED",
        settlementId: s.id,
        cardLast4: best.st.cardLast4,
        deltaBase: Math.round(best.delta * 100) / 100,
      };
    }
    return {
      kind: "UNRECONCILED",
      settlementId: s.id,
      reason: "TOTAL_MISMATCH",
      deltaBase: Math.round(best.delta * 100) / 100,
    };
  });
}

export interface InstalmentTxn {
  id: string;
  bookedAt: Date;
  /** This month's charge (סכום חיוב), signed. */
  amountBase: number;
  instalmentNumber: number;
  instalmentTotal: number;
  descriptionRedacted: string;
}

export interface FutureInstalment {
  transactionId: string;
  dueDate: Date;
  amountBase: number;
  instalmentNumber: number;
  instalmentTotal: number;
  titleEn: string;
  titleHe: string;
}

/**
 * Project the REMAINING instalments of a תשלומים purchase into future dated claims.
 *
 * They are not expenses yet — this month's cash flow uses only `סכום חיוב`. But they
 * are contractually committed, so they belong in the liquidity forecast and must reduce
 * Safe-to-Spend. Emitted as CalendarEvent(INSTALMENT, isCashImpacting=true).
 *
 * Assumes monthly instalments (the Israeli norm) charged on the same day-of-month.
 */
export function projectRemainingInstalments(txn: InstalmentTxn): FutureInstalment[] {
  const remaining = txn.instalmentTotal - txn.instalmentNumber;
  if (remaining <= 0) return [];

  const out: FutureInstalment[] = [];
  const amount = Math.abs(txn.amountBase);
  for (let i = 1; i <= remaining; i += 1) {
    const due = new Date(
      Date.UTC(txn.bookedAt.getUTCFullYear(), txn.bookedAt.getUTCMonth() + i, txn.bookedAt.getUTCDate()),
    );
    const n = txn.instalmentNumber + i;
    out.push({
      transactionId: txn.id,
      dueDate: due,
      amountBase: Math.round(amount * 100) / 100,
      instalmentNumber: n,
      instalmentTotal: txn.instalmentTotal,
      titleEn: `Instalment ${n}/${txn.instalmentTotal} — ${txn.descriptionRedacted}`,
      titleHe: `תשלום ${n} מתוך ${txn.instalmentTotal} — ${txn.descriptionRedacted}`,
    });
  }
  return out;
}

/** Total committed instalment outflow inside a forward window (feeds Safe-to-Spend). */
export function committedInstalmentsInWindow(
  instalments: FutureInstalment[],
  from: Date,
  windowDays: number,
): number {
  const until = new Date(from.getTime() + windowDays * DAY_MS);
  const total = instalments
    .filter((i) => i.dueDate >= from && i.dueDate <= until)
    .reduce((sum, i) => sum + i.amountBase, 0);
  return Math.round(total * 100) / 100;
}
