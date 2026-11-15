// WO-8 (2026-11-15): the deploy settings must survive Railway's Config as Code
// cutoff (2026-12-01, https://docs.railway.com/deploy/config-as-code).
// Before the cutover: railway.json carries them and this only checks the date.
// After it: .railway/railway.ts must carry every setting that keeps a deploy
// safe, including the /data volume that holds the household's documents.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const iacPath = join(root, ".railway", "railway.ts");
const legacyPath = join(root, "railway.json");
const CUTOFF = new Date("2026-12-01T00:00:00Z");

describe("Railway deploy config (WO-8)", () => {
  if (!existsSync(iacPath)) {
    it("is still on railway.json, and the cutoff has not passed", () => {
      expect(existsSync(legacyPath)).toBe(true);
      expect(
        Date.now() < CUTOFF.getTime(),
        "Railway stopped reading railway.json on 2026-12-01: run docs/RAILWAY_IAC_CUTOVER.md",
      ).toBe(true);
    });
    return;
  }

  const src = readFileSync(iacPath, "utf8");

  it("replaced railway.json instead of sitting beside it", () => {
    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(join(root, "apps", "worker", "railway.json"))).toBe(false);
  });

  it("keeps the web service's build, start, migrations, seed and healthcheck", () => {
    expect(src).toContain('service("wealthos-web"');
    expect(src).toContain('builder: "NIXPACKS"');
    expect(src).toContain("next start apps/web");
    expect(src).toContain("migrate:deploy --workspace=@wealthos/db");
    expect(src).toContain("seed --workspace=@wealthos/registry");
    expect(src).toContain('healthcheckPath: "/api/health"');
  });

  it("mounts the document volume at /data", () => {
    expect(src).toMatch(/mountPath:\s*"\/data"/);
  });

  it("keeps the worker's daily cron and no-restart policy", () => {
    expect(src).toContain('service("wealthos-worker"');
    expect(src).toContain('cronSchedule: "0 6 * * *"');
    expect(src).toContain('restartPolicyType: "NEVER"');
  });

  it("names no variable value, only preserve()", () => {
    expect(src).not.toMatch(/AUTH_SECRET:\s*["'`]/);
    expect(src).not.toMatch(/DATABASE_URL:\s*["'`]/);
    expect(src).not.toMatch(/AUTH_PASSWORD_HASH:\s*["'`]/);
  });
});
