/**
 * WealthOS monitoring worker (M9, Phase 4).
 *
 * A one-shot process: connect, run the monitoring cycle for the household, exit.
 * Designed to run as a Railway cron service (see docs/DEPLOY.md) — the container
 * starts on schedule, does one cycle, and exits. It can also be run on demand:
 *   DATABASE_URL=... npm run monitor --workspace=@wealthos/worker
 *
 * The worker is a *system actor*: it observes and raises alerts. It never changes
 * workflow phase — the re-evaluation flow (guarded, human-initiated) does that.
 */
import { prisma } from "@wealthos/db";
import { refreshFxFromBoi, runMonitoringCycle } from "@wealthos/api";

async function main(): Promise<void> {
  const startedAt = Date.now();

  // Daily FX refresh from Bank of Israel — non-fatal: monitoring proceeds on stale
  // rates (the snapshot records which rates were used either way).
  try {
    const fx = await refreshFxFromBoi(prisma);
    console.log(`[worker] BOI FX refresh: stored=${fx.stored} skipped=${fx.skipped} asOf=${fx.asOf}`);
  } catch (err) {
    console.error("[worker] BOI FX refresh FAILED (continuing with stored rates):", err);
  }
  const households = await prisma.household.findMany({ select: { id: true, name: true } });
  if (households.length === 0) {
    console.log("[worker] no household bootstrapped; nothing to monitor.");
    return;
  }

  for (const h of households) {
    try {
      const result = await runMonitoringCycle(prisma, h.id, "CRON");
      console.log(
        `[worker] household=${h.name} run=${result.runId} severity=${result.severity} ` +
          `drift=${result.driftFindings} stale=${result.itemsFlaggedStale} alerts=${result.alertsOpened}`,
      );
    } catch (err) {
      // One household's failure must not abort the sweep of the others.
      console.error(`[worker] monitoring cycle FAILED for household=${h.id}:`, err);
      process.exitCode = 1;
    }
  }
  console.log(`[worker] done in ${Date.now() - startedAt}ms`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (err) => {
    console.error("[worker] fatal:", err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
