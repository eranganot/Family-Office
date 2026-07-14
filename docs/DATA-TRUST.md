# External-data trust ladder (owner decision 2026-07-15)

How WealthOS ingests data it did not create, without violating "engines never guess."
Applies to the deferred feeds — C5 CPI, C1 fund/track composition (Gemel-Net/Pensia-Net),
holdings CSV — and to every future connector.

## The ladder

| Tier | Source class | Examples | Policy |
|------|--------------|----------|--------|
| 1 | Official API, structured, versioned | BOI FX, BOI policy rate, (C5) BOI CPI | **Auto-accept** after bounds check. Record source + asOf. |
| 2 | Official dataset, bulk/irregular shape | (C1) Gemel-Net track composition & fees | **Flagged estimate** — lands as `*Estimated=true`, engines may use it but every consumer surfaces the flag; owner confirms per item (one click), like growth-share suggestions today. |
| 3 | Owner-supplied files | (M22-deferred) holdings CSV, institution PDFs | **Suspense-first** — parsed rows land as suspense items / flagged values; nothing merges into canonical data without explicit owner resolution. Existing M2/M3 machinery already implements this. |
| 4 | Scraped / unofficial | any scraping fallback | **Not ingested.** Displayed (if at all) as advisory text with source link, never written to the ledger or registries. |

## Bounds checks (tier 1)

Every auto-accepted value passes a sanity envelope before upsert; violations quarantine
the value to a `MonitoringAlert` (severity LOW, kind DATA_ANOMALY) instead of storing it:

- FX: rate within ±20% of the previous stored rate for the pair (first value: 0.1–100).
- BOI policy rate: 0–25%, and |Δ| ≤ 3 points vs previous.
- CPI (C5): monthly change within ±5%; index positive and monotone-ish (new value ≥ 0.8× previous).

Rationale: a feed shape-change or API bug must degrade to "stale data + alert",
never to "wrong data inside the engines". Engines already tolerate staleness by design.

## Estimate flags (tier 2)

Pattern already shipped for growth-share heuristics (M14c) — reuse it verbatim:

1. Column `<field>Estimated Boolean @default(false)` next to the value.
2. Setting the value manually clears the flag; a confirm mutation clears it too.
3. Snapshot carries the flag (additive, defaulted) → analyzers emit an INFO finding
   listing unconfirmed estimates → a low-priority recommendation nags politely.
4. Data-quality reporting counts unconfirmed estimates separately from unknowns.

For C1 specifically: fetch composition by fund number (מספר קופה) the owner enters per
account — no name-matching heuristics; no match → stays unknown (never guessed).
Fetched `growthSharePct` overwrites only values still flagged as heuristic estimates,
never owner-confirmed ones. Fees fetched the same way feed the per-type fee analyzer.

## Suspense-first (tier 3)

Holdings CSV (deferred from M22): parse → per-position rows land as suspense items with
raw provenance (adapter framework from M2), owner resolves each into a brokerage account's
holdings or discards. Only resolved holdings feed concentration/allocation engines.
This is why the adapter framework exists; no new trust machinery is needed — the work is
the adapter + a holdings detail table, which is why it was deferred, not descoped.

## Non-negotiables

- Every stored external value records `source` + `asOf` (FxRate and MarketIndicator already do).
- Tier is a property of the SOURCE, not the fetch code path.
- A feed failure is always non-fatal: engines run on the last good value + staleness rules.
- No tier ever bypasses the owner-review flags on tax matrices.
