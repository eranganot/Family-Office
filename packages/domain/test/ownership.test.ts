import { describe, expect, it } from "vitest";
import { validateOwnershipShares } from "../src/ledger/ownership";

describe("validateOwnershipShares", () => {
  it("accepts a single 100% owner and exact splits", () => {
    expect(validateOwnershipShares([{ familyMemberId: "a", sharePct: 100 }]).valid).toBe(true);
    expect(
      validateOwnershipShares([
        { familyMemberId: "a", sharePct: "50" },
        { familyMemberId: "b", sharePct: "50" },
      ]).valid,
    ).toBe(true);
    expect(
      validateOwnershipShares([
        { familyMemberId: "a", sharePct: "33.3333" },
        { familyMemberId: "b", sharePct: "33.3333" },
        { familyMemberId: "c", sharePct: "33.3334" },
      ]).valid,
    ).toBe(true);
  });
  it("rejects empty, duplicates, out-of-range, and wrong sums", () => {
    expect(validateOwnershipShares([])).toMatchObject({ reason: "OWNERSHIP_EMPTY" });
    expect(
      validateOwnershipShares([
        { familyMemberId: "a", sharePct: 50 },
        { familyMemberId: "a", sharePct: 50 },
      ]),
    ).toMatchObject({ reason: "OWNERSHIP_DUPLICATE_MEMBER" });
    expect(validateOwnershipShares([{ familyMemberId: "a", sharePct: 0 }])).toMatchObject({
      reason: "OWNERSHIP_SHARE_OUT_OF_RANGE",
    });
    expect(
      validateOwnershipShares([
        { familyMemberId: "a", sharePct: 60 },
        { familyMemberId: "b", sharePct: 50 },
      ]),
    ).toMatchObject({ reason: "OWNERSHIP_SUM_NOT_100" });
  });
});
