import type { PrismaClient, SnapshotKind } from "@wealthos/db";
import { ledgerRepo } from "@wealthos/db";
import { assessHousehold, type ItemProjection } from "@wealthos/engine-verification";
import { SnapshotPayloadSchema, type SnapshotPayload } from "@wealthos/domain";
import { assumptionRegistry } from "@wealthos/registry";

/**
 * Builds and persists a schema-versioned household snapshot. The ONE place where
 * DB state becomes engine input; all FX conversion happens here with the rates recorded.
 */
export async function buildSnapshot(
  db: PrismaClient,
  householdId: string,
  kind: SnapshotKind,
): Promise<{ snapshotId: string; payload: SnapshotPayload }> {
  const household = await db.household.findFirstOrThrow({ include: { members: { where: { archivedAt: null } } } });
  const items = await ledgerRepo.list(db, householdId);
  const goals = await db.goal.findMany({ where: { householdId, status: "ACTIVE" } });

  const allRates = await db.fxRate.findMany({ orderBy: { asOf: "desc" } });
  const seen = new Set<string>();
  const latestRates = allRates.filter((r) => {
    const k = `${r.from}->${r.to}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const rateMap = new Map(latestRates.map((r) => [`${r.from}->${r.to}`, Number(r.rate)]));
  const base = household.baseCurrency;
  const usedRates = new Set<string>();
  const toBase = (value: number, currency: string): number | null => {
    if (currency === base) return value;
    const direct = rateMap.get(`${currency}->${base}`);
    if (direct) { usedRates.add(`${currency}->${base}`); return value * direct; }
    const inverse = rateMap.get(`${base}->${currency}`);
    if (inverse) { usedRates.add(`${base}->${currency}`); return value / inverse; }
    return null;
  };

  const unconverted: string[] = [];
  const snapshotItems = items.map((i) => {
    const raw = i.latestValuation ? Number(i.latestValuation.value) : null;
    const valueBase = raw === null ? null : toBase(raw, i.latestValuation!.currency);
    if (raw !== null && valueBase === null) unconverted.push(i.id);
    return {
      id: i.id,
      kind: i.kind,
      name: i.name,
      currency: i.currency,
      accountType: i.accountDetail?.accountType ?? null,
      institutionName: i.accountDetail?.institution.name ?? null,
      liquidityClass: i.accountDetail?.liquidityClass ?? null,
      managementFeePct: i.accountDetail?.managementFeePct ? Number(i.accountDetail.managementFeePct) : null,
      growthSharePct: i.accountDetail?.growthSharePct !== null && i.accountDetail?.growthSharePct !== undefined ? Number(i.accountDetail.growthSharePct) : null,
      growthShareEstimated: i.accountDetail?.growthShareEstimated ?? false,
      valueBase,
      valueAsOf: i.latestValuation ? i.latestValuation.asOf.toISOString().slice(0, 10) : null,
      verified: i.verification === "VERIFIED",
      ownerMemberIds: i.ownershipShares.map((o) => o.familyMemberId),
      mortgageTracks: i.mortgageDetail
        ? i.mortgageDetail.tracks.map((t) => ({
            trackType: t.trackType,
            principalRemaining: Number(t.principalRemaining),
            annualRatePct: Number(t.annualRatePct),
            cpiLinked: t.cpiLinked,
            endDate: t.endDate.toISOString().slice(0, 10),
          }))
        : null,
      cashFlow: i.cashFlowDetail
        ? {
            flowType: i.cashFlowDetail.flowType,
            direction: i.cashFlowDetail.direction,
            amountBase: toBase(Number(i.cashFlowDetail.amount), i.currency),
            frequency: i.cashFlowDetail.frequency,
          }
        : null,
      insurance: i.insuranceDetail
        ? {
            policyType: i.insuranceDetail.policyType,
            coverageAmountBase:
              i.insuranceDetail.coverageAmount !== null && i.insuranceDetail.coverageAmount !== undefined
                ? toBase(Number(i.insuranceDetail.coverageAmount), i.currency)
                : null,
            monthlyPremiumBase:
              i.insuranceDetail.monthlyPremium !== null && i.insuranceDetail.monthlyPremium !== undefined
                ? toBase(Number(i.insuranceDetail.monthlyPremium), i.currency)
                : null,
            throughPension: i.insuranceDetail.throughPension,
            insuredMemberId: i.insuranceDetail.insuredMemberId ?? null,
            endDate: i.insuranceDetail.endDate ? i.insuranceDetail.endDate.toISOString().slice(0, 10) : null,
          }
        : undefined,
    };
  });

  const projections: ItemProjection[] = items.map((i) => ({
    id: i.id, name: i.name, kind: i.kind, verification: i.verification, confidence: i.confidence,
    lastConfirmedAt: i.lastConfirmedAt, latestValuationAsOf: i.latestValuation?.asOf ?? null,
  }));
  const pendingSuspense = await db.suspenseItem.count({ where: { status: "PENDING" } });
  const assessment = assessHousehold(projections, pendingSuspense, new Date());
  const goalRealReturnPct = Number(
    (await assumptionRegistry(db).current("goal_projection_real_return_pct", householdId)).value,
  );

  const payload: SnapshotPayload = SnapshotPayloadSchema.parse({
    schemaVersion: 1,
    takenAt: new Date().toISOString(),
    baseCurrency: base,
    workflowState: household.workflowState,
    members: household.members.map((m) => ({
      id: m.id, name: m.name, role: m.role,
      birthDate: m.birthDate ? m.birthDate.toISOString().slice(0, 10) : null,
      employmentStatus: m.employmentStatus,
    })),
    items: snapshotItems,
    goals: goals.map((g) => ({
      id: g.id, type: g.type, name: g.name, priority: g.priority,
      targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null,
      // Income-mode goals: capital target derived from the CURRENT real-return assumption.
      requiredFundingBase: g.targetMonthlyIncome
        ? (Number(g.targetMonthlyIncome) * 12) / (goalRealReturnPct / 100)
        : g.requiredFunding
          ? Number(g.requiredFunding)
          : null,
    })),
    fxRatesUsed: latestRates
      .filter((r) => usedRates.has(`${r.from}->${r.to}`))
      .map((r) => ({ from: r.from, to: r.to, rate: Number(r.rate), asOf: r.asOf.toISOString().slice(0, 10) })),
    dataQuality: {
      completenessScore: assessment.completenessScore,
      confidenceScore: assessment.confidenceScore,
      pendingSuspense,
      unconvertedItemIds: unconverted,
    },
  });

  const row = await db.householdSnapshot.create({
    data: { householdId, kind, schemaVersion: 1, payload: payload as never },
  });
  return { snapshotId: row.id, payload };
}
