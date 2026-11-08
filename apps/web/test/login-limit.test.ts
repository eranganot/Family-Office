import { beforeEach, describe, expect, it } from "vitest";
import {
  clientAddress, isLocked, MAX_GLOBAL, MAX_PER_ADDRESS, recordFailure, recordSuccess, resetLoginLimits, WINDOW_MS,
} from "../src/lib/login-limit";

describe("login brute-force limit (WO-4)", () => {
  beforeEach(resetLoginLimits);

  it("locks an address after MAX_PER_ADDRESS failures, for one window", () => {
    const t = 1_000_000;
    for (let i = 0; i < MAX_PER_ADDRESS; i++) {
      expect(isLocked("1.2.3.4", t)).toBe(false);
      recordFailure("1.2.3.4", t);
    }
    expect(isLocked("1.2.3.4", t)).toBe(true);
    expect(isLocked("5.6.7.8", t)).toBe(false);
    expect(isLocked("1.2.3.4", t + WINDOW_MS + 1)).toBe(false);
  });

  it("rotating addresses still hits the global limit", () => {
    for (let i = 0; i < MAX_GLOBAL; i++) recordFailure(`10.0.0.${i}`, 0);
    expect(isLocked("10.9.9.9", 0)).toBe(true);
  });

  it("a successful sign-in clears that address", () => {
    for (let i = 0; i < MAX_PER_ADDRESS; i++) recordFailure("1.2.3.4", 0);
    recordSuccess("1.2.3.4");
    expect(isLocked("1.2.3.4", 0)).toBe(false);
  });

  it("keys on the last forwarded hop, the one the proxy wrote", () => {
    expect(clientAddress("6.6.6.6, 203.0.113.9")).toBe("203.0.113.9");
    expect(clientAddress(null, "198.51.100.1")).toBe("198.51.100.1");
    expect(clientAddress("", null)).toBe("unknown");
  });
});
