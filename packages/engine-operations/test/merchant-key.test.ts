import { describe, expect, it } from "vitest";
import { normalizeMerchantKey } from "../src/merchant-key";
import { DEFAULT_CATEGORY_TREE, flattenCategoryTree, UNCLASSIFIED_KEY } from "../src/categories";

describe("normalizeMerchantKey", () => {
  it("is deterministic — the same description always yields the same key", () => {
    const a = normalizeMerchantKey("SPOTIFY P43CD5B1CB");
    const b = normalizeMerchantKey("SPOTIFY P43CD5B1CB");
    expect(a).toBe(b);
    expect(a).toBe("SPOTIFY");
  });

  it("strips per-transaction reference codes so the SAME merchant groups together", () => {
    // Real card statements append a different voucher/terminal code every time.
    // Without stripping them, every charge would look like a new merchant.
    expect(normalizeMerchantKey("SPOTIFY P43CD5B1CB")).toBe(normalizeMerchantKey("SPOTIFY Q11ZZ9X0AB"));
  });

  it("drops pure digit runs (terminal / branch / voucher numbers)", () => {
    expect(normalizeMerchantKey("SUPERMARKET 4471 22")).toBe("SUPERMARKET");
  });

  it("repairs reversed Hebrew before building the key", () => {
    const logical = "חשבון חשמל";
    const visual = [...logical].reverse().join("");
    expect(normalizeMerchantKey(visual)).toBe(normalizeMerchantKey(logical));
  });

  it("folds Hebrew final forms so spelling variants match", () => {
    // Same word, one written with a final mem and one without.
    expect(normalizeMerchantKey("מים")).toBe(normalizeMerchantKey("מימ"));
  });

  it("removes gateway prefixes that mask the real merchant", () => {
    expect(normalizeMerchantKey("PAYPAL *IHERB")).toBe("IHERB");
  });

  it("drops corporate-suffix noise", () => {
    expect(normalizeMerchantKey("ACME Ltd")).toBe("ACME");
  });

  it("returns empty string when nothing identifying survives — caller must route to Suspense", () => {
    expect(normalizeMerchantKey("12345 999")).toBe("");
    expect(normalizeMerchantKey("")).toBe("");
  });

  it("normalises case and punctuation", () => {
    expect(normalizeMerchantKey("google  cloud.")).toBe("GOOGLE_CLOUD");
  });
});

describe("default category tree", () => {
  const flat = flattenCategoryTree(DEFAULT_CATEGORY_TREE);

  it("has unique keys", () => {
    const keys = flat.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every child key is prefixed by its parent key (slug hierarchy is coherent)", () => {
    for (const row of flat) {
      if (row.parentKey) expect(row.key.startsWith(`${row.parentKey}.`)).toBe(true);
    }
  });

  it("every parentKey resolves to a real node", () => {
    const keys = new Set(flat.map((c) => c.key));
    for (const row of flat) {
      if (row.parentKey) expect(keys.has(row.parentKey)).toBe(true);
    }
  });

  it("contains the suspense fallback category the non-blocking rule depends on", () => {
    expect(flat.some((c) => c.key === UNCLASSIFIED_KEY)).toBe(true);
  });

  it("classifies pension/hishtalmut/gemel as SAVINGS_FLOW, never as an expense (owner decision D7)", () => {
    for (const key of ["savings.pension", "savings.hishtalmut", "savings.gemel"]) {
      expect(flat.find((c) => c.key === key)?.behavioral).toBe("SAVINGS_FLOW");
    }
  });

  it("classifies card settlement and internal moves as TRANSFER (prevents double-counting)", () => {
    for (const key of ["transfers.card_settlement", "transfers.internal"]) {
      expect(flat.find((c) => c.key === key)?.behavioral).toBe("TRANSFER");
    }
  });

  it("marks every financial-fee leaf as FINANCIAL_DRAG (the optimisation target)", () => {
    const fees = flat.filter((c) => c.parentKey === "financial_fees");
    expect(fees.length).toBeGreaterThan(3);
    for (const f of fees) expect(f.behavioral).toBe("FINANCIAL_DRAG");
  });

  it("keeps INCOME and EXPENSE axes internally consistent across the tree", () => {
    const byKey = new Map(flat.map((c) => [c.key, c]));
    for (const row of flat) {
      if (row.parentKey) expect(row.axis).toBe(byKey.get(row.parentKey)!.axis);
    }
  });
});
