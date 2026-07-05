# WealthOS — Session Status Log

> Read this first in any new session. Update after every meaningful change.

## Current state (2026-07-05)

- **Milestone: M0 COMPLETE and DEPLOYED — awaiting owner approval to start M1.**
- **Live:** https://wealthos-web-production-c1f7.up.railway.app (health, tRPC, auth, RTL verified live).
- Railway service `wealthos-web` (1fe5a904), Postgres provisioned, all env vars set.
  Deployed via `railway up` (project token). Empty `Family-Office` service exists — owner to
  either connect the GitHub repo to `wealthos-web` and delete it, or vice versa.
- Design package approved; owner decisions recorded in docs/architecture/00-README.md.
- Verified in sandbox: npm install clean, 13/13 domain tests pass, all packages typecheck,
  `next build` clean (no warnings), server smoke-tested (health, tRPC ping, auth redirect, RTL).
- NOT yet pushed to GitHub: owner's PAT lacks Contents:Read&Write (confirmed via API probe; error 'Resource not accessible by personal access token', required permission contents=write). Waiting for fixed token.
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

## Next up (M1, after approval)

feat/m1-lint-boundaries → feat/m1-household-entity → feat/m1-state-machine → feat/m1-workflow-guard
→ ledger base + detail tables → manual-entry UI → net-worth view → audit events.
