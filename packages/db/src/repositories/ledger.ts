import type {
  LedgerItem,
  LedgerKind,
  Prisma,
  PrismaClient,
  Valuation,
  ValuationSource,
} from "@prisma/client";

export interface OwnershipShareRow {
  familyMemberId: string;
  sharePct: string;
}

export interface CreateLedgerItemBase {
  kind: LedgerKind;
  name: string;
  currency: string;
  notes?: string | undefined;
  ownership: OwnershipShareRow[];
}

export interface AddValuationInput {
  asOf: Date;
  value: string;
  currency: string;
  source: ValuationSource;
  confidence: number;
  supersedesId?: string | undefined;
}

export type LedgerItemFull = Prisma.LedgerItemGetPayload<{
  include: {
    ownershipShares: { include: { familyMember: true } };
    accountDetail: { include: { institution: true } };
    realEstateDetail: true;
    mortgageDetail: { include: { tracks: true } };
    loanDetail: true;
    cashFlowDetail: true;
    insuranceDetail: true;
  };
}> & { latestValuation: Valuation | null };

const FULL_INCLUDE = {
  ownershipShares: { include: { familyMember: true } },
  accountDetail: { include: { institution: true } },
  realEstateDetail: true,
  mortgageDetail: { include: { tracks: true } },
  loanDetail: true,
  cashFlowDetail: true,
  insuranceDetail: true,
} as const;

async function attachLatestValuations(
  db: PrismaClient,
  items: Omit<LedgerItemFull, "latestValuation">[],
): Promise<LedgerItemFull[]> {
  const results: LedgerItemFull[] = [];
  for (const item of items) {
    const latestValuation = await db.valuation.findFirst({
      where: { ledgerItemId: item.id },
      orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    });
    results.push({ ...item, latestValuation });
  }
  return results;
}

/** Transaction-scoped creation — the single source of truth used by manual entry AND imports. */
export async function createItemInTx(
  tx: Prisma.TransactionClient,
  householdId: string,
  base: CreateLedgerItemBase,
  initialValuation?: AddValuationInput | undefined,
  detail?: ((tx: Prisma.TransactionClient, itemId: string) => Promise<void>) | undefined,
): Promise<{ itemId: string; valuationId: string | undefined }> {
  const item = await tx.ledgerItem.create({
    data: {
      householdId,
      kind: base.kind,
      name: base.name,
      currency: base.currency,
      notes: base.notes ?? null,
      ownershipShares: {
        create: base.ownership.map((o) => ({
          familyMemberId: o.familyMemberId,
          sharePct: o.sharePct,
        })),
      },
    },
  });
  let valuationId: string | undefined;
  if (initialValuation) {
    const v = await tx.valuation.create({
      data: {
        ledgerItemId: item.id,
        asOf: initialValuation.asOf,
        value: initialValuation.value,
        currency: initialValuation.currency,
        source: initialValuation.source,
        confidence: initialValuation.confidence,
      },
    });
    valuationId = v.id;
  }
  if (detail) await detail(tx, item.id);
  return { itemId: item.id, valuationId };
}

export const ledgerRepo = {
  async list(
    db: PrismaClient,
    householdId: string,
    filter?: { kind?: LedgerKind | undefined; includeClosed?: boolean | undefined },
  ): Promise<LedgerItemFull[]> {
    const items = await db.ledgerItem.findMany({
      where: {
        householdId,
        ...(filter?.kind ? { kind: filter.kind } : {}),
        ...(filter?.includeClosed ? {} : { status: "ACTIVE" }),
      },
      include: FULL_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return attachLatestValuations(db, items);
  },

  async get(db: PrismaClient, id: string): Promise<LedgerItemFull | null> {
    const item = await db.ledgerItem.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!item) return null;
    const [full] = await attachLatestValuations(db, [item]);
    return full ?? null;
  },

  /**
   * Creates the base row + ownership + optional initial valuation + kind-specific detail,
   * atomically. `detail` is a callback so each kind's repo composes without duplicating
   * the base logic (single source of truth for item creation).
   */
  async createItem(
    db: PrismaClient,
    householdId: string,
    base: CreateLedgerItemBase,
    initialValuation?: AddValuationInput | undefined,
    detail?: ((tx: Prisma.TransactionClient, itemId: string) => Promise<void>) | undefined,
  ): Promise<string> {
    return db.$transaction(async (tx) => {
      const { itemId } = await createItemInTx(tx, householdId, base, initialValuation, detail);
      return itemId;
    });
  },

  updateBase(
    db: PrismaClient,
    id: string,
    patch: { name?: string | undefined; notes?: string | undefined },
  ): Promise<LedgerItem> {
    const data: Prisma.LedgerItemUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.notes !== undefined) data.notes = patch.notes;
    return db.ledgerItem.update({ where: { id }, data });
  },

  closeItem(db: PrismaClient, id: string): Promise<LedgerItem> {
    return db.ledgerItem.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
  },

  /** Append-only: valuations are never updated or deleted; corrections supersede. */
  addValuation(db: PrismaClient, ledgerItemId: string, input: AddValuationInput): Promise<Valuation> {
    return db.valuation.create({
      data: {
        ledgerItemId,
        asOf: input.asOf,
        value: input.value,
        currency: input.currency,
        source: input.source,
        confidence: input.confidence,
        supersedesId: input.supersedesId ?? null,
      },
    });
  },

  valuationHistory(db: PrismaClient, ledgerItemId: string): Promise<Valuation[]> {
    return db.valuation.findMany({
      where: { ledgerItemId },
      orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    });
  },
};
