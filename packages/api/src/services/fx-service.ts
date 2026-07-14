import type { PrismaClient } from "@wealthos/db";

/**
 * Automatic FX: Bank of Israel official representative rates (public API, JSON).
 * Stored per day with source="BOI"; manual entries (source="MANUAL") are separate
 * rows and remain possible. Consumers read the latest row per pair regardless of
 * source, so a fresher manual rate still wins for the day it is entered.
 * Defensive: unexpected shapes throw, bad entries are skipped — never guessed.
 */

const BOI_URL = "https://boi.org.il/PublicApi/GetExchangeRates?asJson=true";
/** Currencies worth storing daily; extend when the ledger gains new currencies. */
const WANTED = new Set(["USD", "EUR", "GBP", "CHF"]);

interface BoiRate {
  key: string;
  currentExchangeRate: number;
  unit: number;
  lastUpdate: string;
}

export interface FxRefreshResult {
  stored: number;
  skipped: number;
  asOf: string | null;
}

export async function refreshFxFromBoi(db: PrismaClient): Promise<FxRefreshResult> {
  const res = await fetch(BOI_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`BOI_FETCH_FAILED:${res.status}`);
  const data = (await res.json()) as { exchangeRates?: BoiRate[] };
  if (!Array.isArray(data.exchangeRates)) throw new Error("BOI_SHAPE_UNEXPECTED");

  let stored = 0;
  let skipped = 0;
  let asOf: string | null = null;
  for (const r of data.exchangeRates) {
    if (!WANTED.has(r.key)) continue;
    if (!(r.currentExchangeRate > 0) || !(r.unit > 0) || !r.lastUpdate) {
      skipped += 1;
      continue;
    }
    const day = r.lastUpdate.slice(0, 10);
    asOf = day;
    const rate = (r.currentExchangeRate / r.unit).toFixed(8);
    await db.fxRate.upsert({
      where: { from_to_asOf_source: { from: r.key, to: "ILS", asOf: new Date(day), source: "BOI" } },
      create: { from: r.key, to: "ILS", asOf: new Date(day), source: "BOI", rate },
      update: { rate },
    });
    stored += 1;
  }
  return { stored, skipped, asOf };
}
