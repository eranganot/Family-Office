import { expect, test } from "@playwright/test";

/**
 * M42 — routing smoke for the /operations rebuild.
 *
 * Every assertion here corresponds to a defect a human found by clicking. They are
 * written as "where did I end up" checks rather than content checks, because that is
 * what actually broke: correct pages, wrong destinations.
 *
 * This suite is READ-ONLY except where a write is the thing under test, and it never
 * asserts on figures — the owner's data changes, and a smoke test that fails when the
 * surplus moves is a smoke test that gets muted.
 */

const HE = "/he";

test.describe("operations IA", () => {
  test("Today shows only the two inboxes and the count rows", async ({ page }) => {
    await page.goto(`${HE}/operations`);

    // The four sub-nav tabs exist and Today is current.
    for (const tab of ["היום", "החודש הזה", "יומן", "תנועות"]) {
      await expect(page.getByRole("link", { name: tab })).toBeVisible();
    }

    // Regression: these sections MOVED off Today. Their reappearance means a section was
    // copied rather than moved, which renders it in two places at once.
    await expect(page.getByText("יבוא דף חשבון")).toHaveCount(0);
    await expect(page.getByText("עץ הקטגוריות")).toHaveCount(0);
  });

  test("every sub-nav tab resolves — no 404s", async ({ page }) => {
    for (const path of ["/operations", "/operations/month", "/operations/calendar", "/transactions"]) {
      const res = await page.goto(`${HE}${path}`);
      expect(res?.status(), `${path} should not 404`).toBeLessThan(400);
    }
  });

  test("each route has its OWN explainer", async ({ page }) => {
    const titles: string[] = [];
    for (const path of ["/operations", "/operations/month", "/operations/calendar", "/transactions"]) {
      await page.goto(`${HE}${path}`);
      titles.push((await page.locator("h2, h3").first().innerText()).trim());
    }
    // Four routes, four distinct explainers. Identical text means the per-route wiring
    // regressed to the single shared paragraph it replaced.
    expect(new Set(titles).size).toBe(titles.length);
  });
});

test.describe("redirects land where the result is shown", () => {
  /*
   * THE regression class of this milestone. A server action redirect that returns the
   * owner to a page which does not render what he just changed is invisible to every
   * other kind of test: the mutation succeeded, the page rendered, and the user is lost.
   */

  test("calendar window switch keeps you on the calendar", async ({ page }) => {
    await page.goto(`${HE}/operations/calendar`);
    await page.getByRole("link", { name: /120/ }).click();
    await expect(page).toHaveURL(/\/operations\/calendar\?cw=120/);
    // Regression: these links carried `#calendar`, an id that no longer exists on this
    // route, so every window switch jumped to the top of the page.
    expect(page.url()).not.toContain("#calendar");
  });

  test("month navigation stays on the month route", async ({ page }) => {
    await page.goto(`${HE}/operations/month`);
    await page.getByRole("link", { name: /←/ }).first().click();
    await expect(page).toHaveURL(/\/operations\/month\?y=\d{4}&m=\d{1,2}/);
  });

  test("transactions filter is linkable and survives", async ({ page }) => {
    await page.goto(`${HE}/transactions?beh=FINANCIAL_DRAG`);
    await expect(page).toHaveURL(/beh=FINANCIAL_DRAG/);
    const edit = page.getByRole("link", { name: "עריכה" }).first();
    if (await edit.count()) {
      await edit.click();
      // Regression: clicking edit dropped the active filter, so the owner lost his place
      // on the one page where correcting rows IS the task.
      await expect(page).toHaveURL(/beh=FINANCIAL_DRAG/);
      await expect(page).toHaveURL(/edit=/);
    }
  });
});

test.describe("refusals are rendered as refusals", () => {
  /*
   * This module declines to produce figures it cannot stand behind, and those refusals
   * have repeatedly been mistaken for missing features — or worse, silently replaced by
   * a zero. These assert that a refusal SAYS something.
   */

  test("Today's count rows never render an empty value", async ({ page }) => {
    await page.goto(`${HE}/operations`);
    for (const label of ["בריאות פיננסית", "תנועות הממתינות לסיווג", "התראות סטייה פתוחות בעודף"]) {
      const row = page.getByRole("link").filter({ hasText: label });
      await expect(row).toHaveCount(1);
      // A zero must render as "0", and a failure as "could not load" — never as blank.
      // A blank is indistinguishable from a broken query, which is the M41c defect.
      await expect(row).not.toHaveText(new RegExp(`^${label}\\s*$`));
    }
  });
});
