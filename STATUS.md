# WealthOS — Session Status Log

> Read this first in any new session. Update after every meaningful change.

## Current state (2026-07-05)

- **Milestone: M5 COMPLETE — pending deploy verification and owner approval for M6.**
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
- **Live:** https://wealthos-web-production-c1f7.up.railway.app (health, tRPC, auth, RTL verified live).
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

## Next up (M6, after approval) — Strategy Engine v1, the core milestone

Snapshot → analyzers (liquidity, concentration, currency, tax-advantaged headroom, debt) →
recommendation model with structured rationale → rule-based generators (strategy-level only,
product-reference validator) → priority scoring from assumption weights → data-quality gate →
strategy UI. Owner input useful before M6: household composition + retirement ages (Q2/Q6).

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
