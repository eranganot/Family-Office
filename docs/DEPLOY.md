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

### How the `wealthos-worker` service is actually configured

The worker service uses **`apps/worker/railway.json`** (start command `npm run monitor …`,
`cronSchedule` `0 6 * * *` UTC, `restartPolicyType: NEVER`) rather than the root config. It was
created with `railway up --service wealthos-worker` (deploying with that config as the root
`railway.json`) and its only variable is `DATABASE_URL=${{Postgres.DATABASE_URL}}`. To redeploy it,
deploy with `apps/worker/railway.json` in place of the root `railway.json`, or set the worker
service's Config-file path to `apps/worker/railway.json` in the dashboard. `0 6 * * *` UTC ≈ 09:00
Asia/Jerusalem.

## Database backups (D4) � the ledger is the family's financial memory

WealthOS's Postgres is the canonical household ledger; it must be backed up.

### 1. Native Railway backups (primary)

In the Railway project -> **Postgres service -> Backups** tab:

1. **Enable scheduled backups.** Set a **daily** schedule (retention >= 14 days). Railway
   snapshots the volume; Point-in-Time Recovery keeps roughly the last 4 full backups
   (~4-week restore window).
2. Confirm the first snapshot appears before relying on it.
3. **Restore drill:** from the Backups tab, "Restore" clones the snapshot to a new
   volume/service -- restore into a *throwaway* service first, run
   `npx prisma migrate status` + a row count against it, then cut over. Never restore
   in-place onto the live service without a verified snapshot in hand.

### 2. Offsite logical dump (secondary, recommended)

Railway snapshots live in the same account; keep one copy elsewhere. Either add a small
cron service (e.g. the "Postgres -> R2/S3 Backup" template: `RAILWAY_CRON_SCHEDULE="0 3 * * *"`,
gzip + retention), or run a manual monthly `pg_dump` offsite:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=wealthos-$(date +%Y%m%d).dump
# restore into a scratch DB to verify: pg_restore --list wealthos-YYYYMMDD.dump
```

Because the schema is Prisma-migrated, a logical dump + `prisma migrate deploy` on a fresh
DB fully reconstructs the ledger. Store dumps encrypted; they contain household financial data.
