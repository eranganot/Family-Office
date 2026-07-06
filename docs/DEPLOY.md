# Deploying WealthOS to Railway

The service auto-deploys from GitHub `main` (connect once: Service → Settings → Source).

## Required service variables

| Variable | How to produce |
|---|---|
| `AUTH_SECRET` | `openssl rand -hex 32` |
| `AUTH_EMAIL` | the shared household login email |
| `AUTH_PASSWORD_HASH` | `node apps/web/scripts/hash-password.mjs "<password>"` (run locally; never commit) |
| `DATABASE_URL` | reference the Railway Postgres service: `${{Postgres.DATABASE_URL}}` |

## First-time setup checklist

1. Add a PostgreSQL database to the Railway project.
2. Connect the GitHub repo to the service, branch `main`.
3. Set the four variables above on the service.
4. Deploy; verify `https://<domain>/api/health` returns `{ ok: true }`.

Migrations: from M1 on, the build command becomes
`npm run build && npm run migrate:deploy --workspace=@wealthos/db` (not needed while the app
doesn't read the DB at runtime).

## Monitoring worker (M9) — Railway cron service

The worker is a **separate Railway service** in the same project, sharing the Postgres database. It is
a one-shot process: it runs one monitoring cycle and exits, so it fits Railway's cron model.

1. New service → same repo. Set **Cron Schedule** (Settings → Cron) to e.g. `0 6 * * *` (daily 06:00).
2. Start command: `npm run monitor --workspace=@wealthos/worker`
3. Variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (the only variable the worker needs).
4. Do **not** set a healthcheck (it is not a web server); leave restart policy at default.

The worker shares the web service's migrations — run monitoring only after the web service's
`preDeploy` has applied the M9 migration (`20260706090000_m9_monitoring`). On demand / locally:

```bash
DATABASE_URL=... npm run monitor --workspace=@wealthos/worker
```
