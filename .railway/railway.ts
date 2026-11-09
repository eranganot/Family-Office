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
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    replicas: { "europe-west4-drams3a": 1 },
    volumeMounts: { "/data": wealthosWebVolume },
    env: { AUTH_EMAIL: preserve(), AUTH_PASSWORD_HASH: preserve(), AUTH_SECRET: preserve(), DATABASE_URL: preserve(), NPM_CONFIG_LOGLEVEL: preserve() },
  });
  const wealthosWorker = service("wealthos-worker", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    replicas: { "europe-west4-drams3a": 1 },
    env: { DATABASE_URL: preserve() },
  });

  return project("vivacious-presence", {
    variables: { managed: true },
    resources: [functionBun, wealthosWeb, wealthosWorker, Postgres, postgresVolume, wealthosWebVolume],
  });
});
