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
