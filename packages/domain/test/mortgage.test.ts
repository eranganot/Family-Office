import { describe, expect, it } from "vitest";
import { totalPrincipal, validateMortgageTracks } from "../src/ledger/mortgage";

const track = (over: object = {}) => ({
  trackType: "PRIME",
  principalRemaining: "500000",
  annualRatePct: "5.25",
  cpiLinked: false,
  endDate: new Date("2045-01-01"),
  ...over,
});

describe("validateMortgageTracks", () => {
  it("accepts a realistic multi-track mortgage", () => {
    expect(
      validateMortgageTracks([
        track(),
        track({ trackType: "FIXED_LINKED", principalRemaining: "300000", annualRatePct: "3.1", cpiLinked: true }),
      ]).valid,
    ).toBe(true);
  });
  it("rejects empty, zero principal, absurd rates", () => {
    expect(validateMortgageTracks([])).toMatchObject({ reason: "MORTGAGE_NO_TRACKS" });
    expect(validateMortgageTracks([track({ principalRemaining: "0" })])).toMatchObject({ reason: "TRACK_PRINCIPAL_INVALID" });
    expect(validateMortgageTracks([track({ annualRatePct: "45" })])).toMatchObject({ reason: "TRACK_RATE_INVALID" });
  });
  it("sums principal across tracks precisely", () => {
    expect(totalPrincipal([track(), track({ principalRemaining: "250000.50" })]).toString()).toBe("750000.5");
  });
});
