# WealthOS — Session Status Log

> Read this first in any new session. Update after every meaningful change.

## Current state (2026-07-06)

- **Milestone: M9 COMPLETE (Monitoring, Phase 4) — FINAL v1 milestone. Four-phase loop closed. Pending owner approval.**
- M9 delivered: new pure `engine-monitoring` (DriftDetector + staleness sweep, 15 tests) comparing the
  current SCHEDULED snapshot to the strategy baseline (net worth / liquid share / top concentration /
  goal coverage; thresholds registry-owned via 4 new `drift_*` assumptions; MEDIUM at threshold, HIGH
  at 2x; items added/removed); staleness sweep flips VERIFIED→STALE by `staleness_days_by_kind`;
  `runMonitoringCycle` service (snapshot→drift→staleness→MonitoringRun+MonitoringAlerts, audited)
  shared by `apps/worker` (one-shot Railway cron) and an in-app manual trigger; `monitoring` tRPC
  router (runNow/runs/snapshots/alerts/acknowledge/reevaluate) with the guarded re-evaluation bridge
  (MONITORING→VERIFICATION or →STRATEGY, facts computed in-tx, alerts resolved); bilingual monitoring
  UI (open alerts + severities, re-evaluate actions, run history, snapshot timeline, journal outcomes);
  new MonitoringRun/MonitoringAlert models + migration 20260706090000_m9_monitoring; monitoring
  integration test (cycle→drift→staleness→re-evaluation) in CI skipIf style. Docs: 06-monitoring.md,
  DEPLOY worker-cron section, README rewrite, docs/SMOKE-TEST.md (full M1–M9 walkthrough).
- M8 delivered: deterministic real-terms projector (annual steps; investable grows at assumption
  return; real estate flat in real terms; mortgage straight-line amortization with CPI-linked
  tracks responding to inflation SURPRISE; income/market shocks; goal outcomes; depletion year;
  documented v1 simplifications incl. payments-inside-expense-flows policy) — 8 tests;
  8 canned scenarios (retire earlier/later, job loss, market crash, high inflation, refinance,
  savings ±) behind workflowGuard(STRATEGY), persisted with baseline snapshot id; comparison UI
  (net-worth milestones + Δ row, lowest-investable point, depletion year, per-goal funded status
  baseline vs scenario). Monte Carlo explicitly deferred — same projector interface.
- M7 delivered: decide() captures expected outcome + implementation date; journal router works in
  ANY phase (recording actual outcomes is a MONITORING activity); bilingual journal history page
  with inline actual-outcome recording; outcome round-trip integration-tested.
- M6 delivered: versioned SnapshotPayload contract + builder (FX recorded, data-quality embedded);
  5 analyzers (liquidity/runway vs emergency target, single-asset + institution concentration,
  currency home-bias/excess, tax-advantaged structural headroom incl. fee drag, mortgage CPI mix +
  expensive tracks) — all pure, threshold-driven from AssumptionRegistry; 11 recommendation
  generators with FULL bilingual structured rationale (why/benefits/risks/tradeoffs/tax/liquidity/
  horizon/sensitivity/alternatives/impact); product-reference validator (Hebrew-aware — note: \b
  fails near Hebrew chars); priority scoring from priority_weights; data-quality gate that REFUSES
  below completeness/confidence thresholds and returns a data-gap report; guarded run pipeline
  (workflowGuard STRATEGY) with reproducibility pins (snapshot + engine version + assumption
  id@version + evidence + goal links), supersede-on-rerun keeping ACCEPTED; decisions journaled;
  strategy UI with full explainability cards. 2 end-to-end integration tests (refusal path +
  full run/decide/rerun path).
- M5 delivered: goal model (11 types, priorities, acyclic dependency validation in domain),
  funding-gap engine (documented pool policy: LIQUID for all goals, RETIREMENT reserved for
  retirement/FI goals; priority-ordered PV allocation; FV projection + annuity monthly-saving
  from the goal_projection_real_return_pct assumption (3% conservative default); verified
  ILS-converted assets only; incomputable goals reported with reasons — 7 engine tests),
  bilingual goal UI with gap dashboard.
- NOTE: tax matrices still PENDING OWNER REVIEW (M4) — owner approved proceeding but has not
  yet confirmed the figures; ownerReviewed stays false.
- M4 delivered: TaxRegistry (versioned, schema-validated, year-keyed accessor; throws on missing
  rules — engines can never guess), IL 2025+2026 matrices seeded with cited sources (income tax
  brackets incl. the March-2026 retroactive widening, credit points, capital gains, hishtalmut
  ceilings, pension ceilings 45a/47, bituach leumi thresholds, purchase tax), AssumptionRegistry
  (7 conservative defaults incl. staleness thresholds + M6 priority weights; household overrides
  create new versions), invalidation (new assumption version → pinned recommendations
  INVALIDATED, integration-tested), bilingual registry UI with sources + review badges.
- Bituach leumi employee RATES intentionally null (sources conflicted) — thresholds verified.
  All matrices flagged ownerReviewed=false until Eran signs off; production DB seeded.
- M3 delivered: verification engine (per-item issues: no/stale valuation by kind-specific
  thresholds, never-confirmed, low-confidence, rejected; household completeness+confidence
  scores; gate logic), missing-docs report derived from ledger composition (pension/hishtalmut/
  gemel/bank/brokerage/mortgage/106 expectations, present/stale/missing), review queue UI
  (verify / reject-with-note / correct-value-append), suspense resolution UI (discard / link to
  existing / create account with raw-data prefill), phase-gate UI with the only workflow
  transition controls, and a full-flow integration test: blocked by unverified item → blocked by
  suspense → resolve → STRATEGY reached, transitions audited.
- M2 delivered: adapter framework (versioned RawDataPayload, registry, Israeli normalization
  utils), deterministic LedgerFactory (canonical vs suspense, never guesses — 8 failure modes
  tested), content-addressed immutable document store on a Railway volume (created via API,
  mounted /data), atomic import orchestration with per-field provenance + re-import matching
  (externalRef+institution → valuation append, no dupes), Israeli account-summary CSV adapter
  (Hebrew header synonyms + product-type lexicon), synthetic fixture corpus (hishtalmut/bank/
  Mislaka-style CSVs + GENERATED visual-order Hebrew pension PDF), IL pension PDF adapter
  (pdfjs text matrix + empirical RTL repair: pdf.js renders visual-order PDFs as full char
  reversal — fixture-verified), bilingual import UI (upload → ownership → report → suspense
  list), and real-PostgreSQL integration tests + CI postgres service (clears M1 debt).
- Key M2 discovery: pdf.js bidi turns visual-order Hebrew PDFs into exact full-line char
  reversal (digits included) — the RTL repair is built and tested around that empirical fact.
- M1 delivered: boundary lint (verified catching violations), initial DB migration applied to
  Railway PG, household/member CRUD, workflow state machine (18 tests incl. exhaustive matrix),
  workflowGuard (blocking-matrix tested), full ledger (accounts w/ Israeli types, real estate,
  multi-track mortgages, cash flow, insurance, loans), append-only valuations, ownership=100%%
  invariant, audit events on every mutation (tested), conservative multi-currency net worth
  (exclusion reporting, never guesses), manual FX rates, full bilingual he/en manual-entry UI.
- M0 was: foundation shell (deployed + pushed).
- **Live:** https://wealthos-web-production-c1f7.up.railway.app — **M9 deployed** (migration
  20260706090000_m9_monitoring applied to prod; 4 drift assumptions seeded; monitoring UI + manual
  trigger live). Deployed via `railway up` from a clean /tmp checkout (the mount corrupted `.nvmrc`
  with null bytes on the first attempt → build failed → redeploy from /tmp succeeded).
- **NEW Railway service `wealthos-worker`** (cron `0 6 * * *` UTC, start `npm run monitor …`,
  DATABASE_URL→Postgres). Created via `railway up --service wealthos-worker` (project token can `up`
  + set vars but NOT `add`/`link`/`whoami`). Config recorded in apps/worker/railway.json. Idle until
  first scheduled run; identical code path to the in-app "Run monitoring now".
- **GitHub push PENDING (owner action):** M9 commits are on local `main` (mount + committed) but NOT
  pushed — this session could not read the prior session's /tmp/.git-credentials (owned by another
  user). Prod is ahead of GitHub `main` until the owner runs `git push origin main` (+ feature
  branches). CI has not run these commits yet; DB-bound integration tests (incl. monitoring) run there.
- Railway service `wealthos-web` (1fe5a904), Postgres provisioned, all env vars set.
  Deployed via `railway up` (project token). Empty `Family-Office` service exists — owner to
  either connect the GitHub repo to `wealthos-web` and delete it, or vice versa.
- Design package approved; owner decisions recorded in docs/architecture/00-README.md.
- Verified in sandbox: npm install clean, 13/13 domain tests pass, all packages typecheck,
  `next build` clean (no warnings), server smoke-tested (health, tRPC ping, auth redirect, RTL).
- GitHub: pushed (main + all branches). CI wired. PAT stored in /tmp/.git-credentials (session-only).
- Railway: owner to connect repo + set env vars per docs/DEPLOY.md. Not deployed yet.

## Known technical debt

- feat/m1-lint-boundaries: ESLint boundary rules deferred from M0 (first branch of M1).
- Auth reads env vars (AUTH_EMAIL/AUTH_PASSWORD_HASH); swaps to DB User row in M1.
- No `lint` task wired into turbo yet (comes with lint-boundaries branch).

## Session workflow warnings (Windows mount)

- The user folder mount silently corrupts git atomic writes (`.git/config` was zeroed once) and
  can truncate >250-line Edit-tool writes. **Work in /tmp/wealthos, rsync to the mount,
  never run git write-ops on the mount.** `core.fileMode false` is set on the mount repo.
- Sandbox bash: 45s hard timeout per call; background processes do not survive between calls;
  run npm installs as repeated `timeout 40 npm install` slices (cache resumes).

## Next up — v1 COMPLETE

All four phases shipped (M0–M9); the MAPPING→VERIFICATION→STRATEGY→MONITORING loop is closed.
Post-v1 backlog (architecture already accommodates): real-document adapters per institution, Monte
Carlo, AI copilot (read-only over canonical model), additional countries (registry keyed by country),
per-person auth, connectors (new ValuationSource), estate module deep-dive.

## M9 notes / technical debt

- Baseline = latest PRE_STRATEGY snapshot; goal-coverage drift is a coarse assets/Σrequired tripwire,
  not the M5 funding-gap engine (post-v1 refinement).
- Worker is one-shot (Railway cron model); sweeps all households (family scale: one). Railway cron
  service must be wired per docs/DEPLOY.md (start: monitor script; schedule e.g. `0 6 * * *`).
- `apps/worker` runs TS directly via `tsx` (consistent with the workspace's TS-source packages).
- Sandbox-only: a broken offline pdfjs-dist install (missing bundled types/) can make ingestion
  typecheck + the pension-PDF runtime test fail; a clean install resolves both (CI unaffected).

## M4 notes

- Registry seed runs in preDeploy (idempotent, never overwrites versions).
- Verification thresholds now read from AssumptionRegistry (M3 note resolved).

## M3 technical debt

- Suspense create-from-raw covers ACCOUNT only (matches factory v1 scope).
- Verification page loads full ledger twice (assessment + display) — fine at family scale.

## M2 technical debt (carried)

- Adapter version-bump discipline is convention, not yet CI-enforced.
- PDF adapter is fixture-grade: real institution PDFs will need adapter iterations (expected;
  suspense absorbs unknowns). Mislaka XML adapter awaits real documents.
- Import ownership defaults applied per import run; per-item ownership editing lands with M3
  verification UI. Bituach menahalim product type intentionally unsupported → suspense.
- fileParallelism disabled for DB-bound test suites (shared test DB).

## M1 technical debt (carried)

- Mortgage form supports up to 4 static track rows (no client-side dynamic rows yet).
- Auth still env-var based (swap to DB User row planned).
- next build skips its own TS pass; tsc --noEmit gates types via turbo/CI instead.
