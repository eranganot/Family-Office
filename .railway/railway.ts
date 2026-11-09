// Railway infrastructure as code for WealthOS (replaces railway.json and
// apps/worker/railway.json; Config as Code stops being read on 2026-12-01). Pulled
// from the live project with `railway config pull`, then given the build/deploy
// settings the two railway.json files carried, which the pull cannot see because
// they were applied per deploy, not stored on the services.
//
// Railway does not read this file on deploy: change it, run `railway config plan`,
// then `railway config apply`. Variables are managed: every name must be listed
// with preserve() or apply DELETES it. Add a name here before adding it in Railway.
import { defineRailway, fn, github, image, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "europe-west4-drams3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "europe-west4-drams3a", sizeMB: 5000 });
  const wealthosWebVolume = volume("wealthos-web-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "europe-west4-drams3a", sizeMB: 5000 });
  const functionBun = fn("function-bun", {
    codeFile: "functions/function-bun.ts",
    source: image("ghcr.io/railwayapp/function-bun:1.4.4"),
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    replicas: { "europe-west4-drams3a": 1 },
    deploy: { sleepApplication: true },
  });
  const wealthosWeb = service("wealthos-web", {
    source: github("eranganot/Family-Office", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "NIXPACKS", buildCommand: "npm run build" },
    deploy: {
      startCommand: "node node_modules/next/dist/bin/next start apps/web -p ${PORT:-3000}",
      // Migrations and the registry seed run before the new build takes traffic.
      preDeployCommand: ["npm run migrate:deploy --workspace=@wealthos/db && npm run seed --workspace=@wealthos/registry"],
      healthcheckPath: "/api/health",
      healthcheckTimeout: 120,
      // Restart policy: Railway's default (ON_FAILURE); declaring it leaves a phantom diff in plan.
    },
    replicas: { "europe-west4-drams3a": 1 },
    volumeMounts: { "/data": wealthosWebVolume },
    env: { AUTH_EMAIL: preserve(), AUTH_PASSWORD_HASH: preserve(), AUTH_SECRET: preserve(), DATABASE_URL: preserve(), NPM_CONFIG_LOGLEVEL: preserve() },
  });
  // One-shot monitoring cycle on a daily cron (06:00 UTC, about 09:00 Israel time).
  // No source: it is deployed with `railway up --service wealthos-worker`.
  const wealthosWorker = service("wealthos-worker", {
    build: { buildEnvironment: "V3", builder: "NIXPACKS", buildCommand: "npm run build" },
    deploy: {
      startCommand: "npm run monitor --workspace=@wealthos/worker",
      cronSchedule: "0 6 * * *",
      restartPolicyType: "NEVER",
    },
    replicas: { "europe-west4-drams3a": 1 },
    env: { DATABASE_URL: preserve() },
  });

  return project("vivacious-presence", {
    variables: { managed: true },
    resources: [functionBun, wealthosWeb, wealthosWorker, Postgres, postgresVolume, wealthosWebVolume],
  });
});
