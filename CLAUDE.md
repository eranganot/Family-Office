# WealthOS (Family Office Replacement) — Claude working notes

Self-hosted **Household Wealth Strategy Operating System** — the internal software of a family office: map → verify → strategize → monitor. Strategy-level decision support only; **never** product/security recommendations, **never** trade execution. Owner: Eran (bilingual EN/HE).

Monorepo: npm workspaces + Turborepo, TypeScript end-to-end (Next.js App Router, tRPC, Prisma/PostgreSQL), next-intl he (RTL) / en. Deployed on Railway (`wealthos-web`), Postgres provisioned. Live: https://wealthos-web-production-c1f7.up.railway.app

## How to work in this repo
- **Read `STATUS.md` first** every session (it's a per-milestone session log, updated after every meaningful change) — then update it when you ship or end a session.
- **Milestone flow:** work proceeds M0…M9 on `feat/mN-*` branches merged to `main`; M8 is done, **M9 (Monitoring, final v1) awaits owner go-ahead.** Each milestone ends with a `chore: STATUS — MN complete` commit.
- Verify before any deploy: `tsc --noEmit` (via turbo/CI — `next build` skips its own TS pass), tests, `prisma validate`. Keep CI green.

## ⚠️ Windows-mount hazards (important)
- The user-folder mount **silently corrupts git atomic writes** (`.git/config` was zeroed once) and can **truncate >250-line Edit-tool writes.** **Work in `/tmp/wealthos`, rsync to the mount, and never run git write-ops on the mount.** `core.fileMode false` is set on the mount repo.
- Sandbox bash has a **45s hard timeout** per call and background processes don't survive between calls — run `npm install` as repeated `timeout 40 npm install` slices (cache resumes).

## Domain / behavior rules
- **Engines never guess.** TaxRegistry throws on missing rules; LedgerFactory routes unknowns to a suspense account; net-worth consolidation excludes-and-reports rather than fabricating. Recommendations carry full bilingual rationale + reproducibility pins (snapshot + engine version + assumption id@version + evidence + goal links).
- **Assumption/Tax registries are versioned.** Household overrides create new versions; a new assumption version INVALIDATES pinned recommendations. Thresholds live in the AssumptionRegistry, not in code.
- **Tax matrices are `ownerReviewed=false`** until Eran signs off the IL 2025/2026 figures. Bituach leumi employee *rates* are intentionally null (sources conflicted); thresholds are verified.
- **Public repo — never commit household data:** no real documents, balances, or statements. All ingestion fixtures are synthetic.
- The four-phase state machine (MAPPING → VERIFICATION → STRATEGY → MONITORING) is enforced at the API via `workflowGuard`; strategy runs are gated on STRATEGY phase.

## Known sharp edges
- **pdf.js bidi** renders visual-order Hebrew PDFs as exact full-line char reversal (digits included) — the IL pension PDF adapter's RTL repair is built and fixture-tested around that fact; real institution PDFs will need adapter iterations (suspense absorbs unknowns).
- Product-reference validator is Hebrew-aware — `\b` fails near Hebrew chars.
- DB-bound test suites run with `fileParallelism` disabled (shared test DB).
- Auth is still env-var based (`AUTH_EMAIL`/`AUTH_PASSWORD_HASH`) — DB User row swap planned.

## Response style (token-saving)
Short checklist summaries (files changed + commands + smoke check). Don't paste whole CI/build logs — the failing job + relevant lines. Edit in place. Use the Explore subagent for broad "where is X" searches.
