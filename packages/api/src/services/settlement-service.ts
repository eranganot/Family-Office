import type { PrismaClient } from "@wealthos/db";
import { parseSettlementLine } from "@wealthos/ingestion";

/**
 * Link a bank's aggregate card-bill line to the detailed card statement that itemises it.
 *
 * The bank shows one debit per card bill ("ישראכרט בע\"מ - 6170  6,835.58"); the card
 * statement lists the individual purchases. Counting both doubles every card expense.
 *
 * Rule (deliberately conservative): the bank line becomes a TRANSFER — excluded from
 * both income and expenses — ONLY when itemised card transactions for that card's last 4
 * exist and their total reconciles within tolerance. If no detail was imported, the
 * aggregate STANDS as the expense, because suppressing it would silently delete real
 * spending from the month. Wrong-but-quiet is the failure mode to avoid.
 */

const ABS_TOLERANCE = 1.0;
const REL_TOLERANCE = 0.02; // card bills can carry small fees/rounding
const WINDOW_DAYS = 20; // purchases settle up to ~3 weeks before the bill

export interface SettlementLinkResult {
  linked: number;
  unlinked: number;
  details: Array<{ last4: string; bankAmount: number; cardTotal: number; linked: boolean }>;
}

export async function linkCardSettlements(
  db: PrismaClient,
  householdId: string,
): Promise<SettlementLinkResult> {
  const transferCat = await db.cashFlowCategory.findFirst({
    where: { householdId, key: "transfers.card_settlement" },
    select: { id: true },
  });

  const bankLines = await db.transaction.findMany({
    where: { householdId, status: "BOOKED", amount: { lt: 0 } },
    select: { id: true, bookedAt: true, amount: true, descriptionRedacted: true, settlementLinkId: true },
  });

  const details: SettlementLinkResult["details"] = [];
  let linked = 0;
  let unlinked = 0;

  for (const line of bankLines) {
    const ref = parseSettlementLine(line.descriptionRedacted);
    if (!ref) continue;

    const bankAmount = Math.abs(Number(line.amount));
    const from = new Date(line.bookedAt.getTime() - WINDOW_DAYS * 86_400_000);

    // Card transactions are identified by the batch that imported them carrying this
    // card's last 4 — recorded at import time from the statement itself.
    const cardTxns = await db.transaction.findMany({
      where: {
        householdId,
        status: "BOOKED",
        bookedAt: { gte: from, lte: line.bookedAt },
        importBatch: { rawPayload: { path: ["cardLast4"], equals: ref.last4 } },
      },
      select: { amount: true },
    });
    if (cardTxns.length === 0) {
      unlinked += 1;
      details.push({ last4: ref.last4, bankAmount, cardTotal: 0, linked: false });
      continue;
    }

    const cardTotal = cardTxns.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const tolerance = Math.max(ABS_TOLERANCE, bankAmount * REL_TOLERANCE);
    const reconciles = Math.abs(cardTotal - bankAmount) <= tolerance;

    if (reconciles) {
      await db.transaction.update({
        where: { id: line.id },
        data: {
          behavioralClass: "TRANSFER",
          settlementLinkId: ref.last4,
          ...(transferCat ? { categoryId: transferCat.id } : {}),
        },
      });
      linked += 1;
    } else {
      unlinked += 1;
    }
    details.push({ last4: ref.last4, bankAmount, cardTotal, linked: reconciles });
  }

  return { linked, unlinked, details };
}
