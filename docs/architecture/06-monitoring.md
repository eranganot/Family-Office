# 06 — Monitoring (Phase 4, M9)

Monitoring closes the four-phase loop. It observes the household on a schedule, compares it to the
strategy baseline, flags stale data, and routes back into the loop. It **observes and alerts only** —
it never changes workflow phase by itself. The one guarded bridge (re-evaluation) is human-initiated.

## Components

- **`apps/worker`** — a one-shot Node process (Railway cron). Connects, runs the monitoring cycle for
  the household, exits. Also runnable on demand: `npm run monitor --workspace=@wealthos/worker`.
- **`runMonitoringCycle` (`packages/api`)** — the cycle: take a `SCHEDULED` snapshot (same builder as
  strategy — one source of truth), detect drift, sweep staleness, persist a `MonitoringRun` and its
  `MonitoringAlert`s. Shared by the worker and the in-app manual trigger.
- **`packages/engine-monitoring`** — pure, unit-tested:
  - **DriftDetector** — compares the current snapshot's metrics (net worth, liquid share, top
    concentration, goal coverage) to the strategy baseline. Every threshold is supplied by the caller
    from the AssumptionRegistry; nothing is hard-coded. A crossed threshold is `MEDIUM`; twice the
    threshold is `HIGH`. It also reports holdings added/removed since the baseline.
  - **staleness sweep** — flags currently-VERIFIED items whose latest valuation aged past the per-kind
    threshold (`staleness_days_by_kind`, the same source the M3 assessor reads).
- **Re-evaluation (`monitoring.reevaluate`)** — from MONITORING, the guarded transition to
  VERIFICATION (re-verify stale/changed data) or STRATEGY (re-run the engine). Facts are computed from
  the ledger inside the transaction; open alerts are resolved as the household acts.

## Thresholds (conservative defaults, registry-owned, household-overridable)

| Assumption | Default | Meaning |
|---|---|---|
| `drift_net_worth_pct` | 10 | Relative net-worth change vs baseline that is drift. |
| `drift_liquidity_pct` | 10 | Liquid-share change in percentage points. |
| `drift_concentration_pct` | 5 | Single-asset concentration *increase* in pp. |
| `drift_goal_funding_pct` | 10 | Goal-coverage change in pp. |
| `staleness_days_by_kind` | per-kind (ACCOUNT 400 …) | Valuation age that flags STALE. |

## Data model

- `MonitoringRun` — one cycle: the `SCHEDULED` snapshot, the baseline compared against, trigger
  (`CRON`/`MANUAL`), max severity, the structured drift + staleness reports, and how many items were
  flagged stale. Immutable.
- `MonitoringAlert` — one actionable finding: kind, severity, bilingual title, structured detail, a
  recommended action (`REVERIFY` / `RERUN_STRATEGY` / `REVIEW`), and status
  (`OPEN` → `ACKNOWLEDGED` → `RESOLVED`).

## The loop

```
STRATEGY ──accept──▶ MONITORING ──worker/cron──▶ snapshot ─▶ drift + staleness
                          ▲                                        │
                          │                                   alerts raised
                          │                                        │
              re-run  ◀── STRATEGY  ◀── RERUN_STRATEGY ── re-evaluate ── REVERIFY ──▶ VERIFICATION ──gate──▶ STRATEGY
```

## Design notes / v1 simplifications

- Baseline = the most recent `PRE_STRATEGY` snapshot (the picture the last strategy run was built on).
- Goal-coverage is a coarse `assets / Σ required goal funding` ratio — a monitoring tripwire, not the
  M5 funding-gap engine. Full per-goal funding drift is a post-v1 refinement.
- The worker sweeps every household in the DB (family-office scale: one). One household's failure
  never aborts the others.
- Monte Carlo remains deferred (M8 note) — additive later, same projector interface.
