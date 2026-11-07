import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * WO-2 (2026-11-05): sign in once, save the session for every test.
 *
 * Every page the suite visits is behind the login middleware, so without a
 * session each test landed on /he/login and failed - the workflow would have
 * gone red on its first run. Credentials come from E2E_EMAIL / E2E_PASSWORD
 * (GitHub secrets in e2e.yml); without them this refuses loudly rather than
 * letting every test fail on a login page.
 */
export const STATE = "e2e/.auth/state.json";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const email = process.env["E2E_EMAIL"];
  const password = process.env["E2E_PASSWORD"];
  if (!email || !password) {
    throw new Error("E2E_EMAIL and E2E_PASSWORD must be set: every page under test needs a signed-in session.");
  }
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  // E2E_CHROMIUM: run against an already-installed Chromium (local sandboxes).
  const exe = process.env["E2E_CHROMIUM"];
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ baseURL, locale: "he-IL" });
  await page.goto("/he/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  mkdirSync(dirname(STATE), { recursive: true });
  await page.context().storageState({ path: STATE });
  await browser.close();
}
