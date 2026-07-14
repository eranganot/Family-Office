import type { PrismaClient } from "@wealthos/db";

/**
 * Bank of Israel policy interest rate (public API, JSON — same family as the FX feed).
 * Stored as a MarketIndicator row (key=BOI_RATE, source=BOI) per publication date.
 * The Israeli "prime" rate = BOI rate + a fixed spread, so this anchors the mortgage
 * refinance benchmark. Defensive: unexpected shapes throw; never guessed.
 */
const BOI_INTEREST_URL = "https://boi.org.il/PublicApi/GetInterest?asJson=true";

export interface BoiRateRefreshResult {
  value: number;
  asOf: string;
}

export async function refreshBoiRate(db: PrismaClient): Promise<BoiRateRefreshResult> {
  const res = await fetch(BOI_INTEREST_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`BOI_RATE_FETCH_FAILED:${res.status}`);
  const data = (await res.json()) as { currentInterest?: number; lastPublishedDate?: string };
  if (typeof data.currentInterest !== "number" || !(data.currentInterest >= 0) || !data.lastPublishedDate) {
    throw new Error("BOI_RATE_SHAPE_UNEXPECTED");
  }
  const asOf = data.lastPublishedDate.slice(0, 10);
  await db.marketIndicator.upsert({
    where: { key_asOf_source: { key: "BOI_RATE", asOf: new Date(asOf), source: "BOI" } },
    create: { key: "BOI_RATE", asOf: new Date(asOf), source: "BOI", value: String(data.currentInterest) },
    update: { value: String(data.currentInterest) },
  });
  return { value: data.currentInterest, asOf };
}

/** Latest stored BOI policy rate (%), or null if none fetched yet. */
export async function latestBoiRate(db: PrismaClient): Promise<{ value: number; asOf: string } | null> {
  const row = await db.marketIndicator.findFirst({ where: { key: "BOI_RATE" }, orderBy: { asOf: "desc" } });
  return row ? { value: Number(row.value), asOf: row.asOf.toISOString().slice(0, 10) } : null;
}
