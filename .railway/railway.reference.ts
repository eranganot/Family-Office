// WO-8 (2026-11-15): reference for moving WealthOS off Railway Config as Code.
//
// Railway stops reading railway.json on 2026-12-01 (hard cutoff,
// https://docs.railway.com/deploy/config-as-code). Two services depend on it:
//   - wealthos-web: railway.json (root) carries the NIXPACKS builder, the build,
//     the custom start command (`next start apps/web`), the preDeploy
//     migrate + registry seed, the /api/health healthcheck and restart policy.
//   - wealthos-worker: apps/worker/railway.json carries its start command, the
//     daily cron (0 6 * * * UTC) and restartPolicyType NEVER (docs/DEPLOY.md).
//
// THIS FILE IS NOT READ BY RAILWAY (the CLI reads .railway/railway.ts).
// It was written without access to the Railway project. Three things must come
// from `railway config pull` (docs/RAILWAY_IAC_CUTOVER.md) before anything is
// applied:
//   1. The exact variable names of both services. An unlisted variable is
//      DELETED by `apply` (InvestWise's first plan proposed deleting all 32).
//   2. The web service's VOLUME, mounted at /data. It holds the household's
//      uploaded documents (DiskFileStore, packages/db/src/file-store.ts:24-26;
//      STATUS M2 "Railway volume, mounted /data"). Its Railway name is unknown
//      here, so it is deliberately NOT declared below: copy the volumeMounts
//      entry exactly as `pull` writes it. A guessed name could mount a new,
//      empty volume over /data. tests in apps/web/test/railway-iac.test.ts
//      refuse a railway.ts without a /data mount.
//   3. Whether the worker has a GitHub source. It was created with `railway up`
//      (docs/DEPLOY.md), so it may have none; declaring one would make it
//      rebuild on every push.
//
// Field names are checked against the railway npm package 3.17.0
// (railway/iac BuildConfig / DeployConfig).
import { defineRailway, github, preserve, project, service } from "railway/iac";

export const partial = "wealthos";

export default defineRailway(() => {
  const web = service("wealthos-web", {
    source: github("eranganot/Family-Office", { branch: "main", checkSuites: false }),
    // From docs/DEPLOY.md "Required service variables" + the code. RECONCILE with pull.
    variables: {
      AUTH_EMAIL: preserve(),
      AUTH_PASSWORD_HASH: preserve(),
      AUTH_SECRET: preserve(),
      DATABASE_URL: preserve(),
    },
    // volumeMounts: { "<name from pull>": { mountPath: "/data" } },  <- REQUIRED, from pull
    build: {
      builder: "NIXPACKS",
      buildCommand: "npm run build",
    },
    deploy: {
      startCommand: "node node_modules/next/dist/bin/next start apps/web -p ${PORT:-3000}",
      // Migrations, then the tax registry seed (IL 2025/2026 rules). A failure stops the deploy.
      preDeployCommand: [
        "npm run migrate:deploy --workspace=@wealthos/db && npm run seed --workspace=@wealthos/registry",
      ],
      healthcheckPath: "/api/health",
      healthcheckTimeout: 120,
      // railway.json: restartPolicyType ON_FAILURE, no retry count. ON_FAILURE is
      // Railway's default and is stored as null, so it is left implicit here
      // (declaring it leaves a phantom diff, InvestWise PR 119).
    },
  });

  const worker = service("wealthos-worker", {
    // source: <only if pull shows one>
    variables: {
      DATABASE_URL: preserve(),
    },
    build: {
      builder: "NIXPACKS",
      buildCommand: "npm run build",
    },
    deploy: {
      startCommand: "npm run monitor --workspace=@wealthos/worker",
      cronSchedule: "0 6 * * *",
      restartPolicyType: "NEVER",
    },
  });

  return project("vivacious-presence", {
    resources: [web, worker],
  });
});
