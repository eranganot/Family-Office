import { defineConfig, devices } from "@playwright/test";

/**
 * M42 — end-to-end smoke.
 *
 * WHY THIS EXISTS, stated plainly: almost every defect in the M41/M42 QA rounds was
 * found by the owner clicking through the app, and NONE were caught by tsc, vitest or
 * eslint. Duplicate opportunity cards, doubled drift alerts, the calendar jumping to the
 * top, month actions landing on the wrong month, the filter clearing on edit, a suspense
 * link pointing at a page that no longer had a transaction list. Every one is a
 * navigation or wiring fault between correct units — exactly the seam unit tests do not
 * cover and an e2e suite covers for free.
 *
 * Scope is deliberately narrow: ROUTING and REDIRECTS, not business logic. The engines
 * already have unit tests with far better coverage than a browser could give them, and a
 * slow suite that re-tests arithmetic is one nobody runs.
 */
export default defineConfig({
  testDir: "./e2e",
  // A smoke suite that takes minutes is a smoke suite that gets skipped.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  // Fail the build on a stray `test.only` rather than silently running one test.
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:3000",
    // Traces only on a retry: full traces on every run bloat CI artifacts for no gain.
    trace: "on-first-retry",
    locale: "he-IL",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /*
   * No `webServer` block on purpose. This suite runs against a DEPLOYED instance
   * (E2E_BASE_URL), because the faults it hunts are routing and redirect faults that
   * only exist once the app is actually served. Booting a dev server here would also
   * need a seeded database, and a smoke suite that depends on fixture data drifts out of
   * date faster than the code it guards.
   */
});
