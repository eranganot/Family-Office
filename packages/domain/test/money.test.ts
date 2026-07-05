import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { Money } from "../src/values/money.js";

describe("Money", () => {
  it("constructs from string, number, Decimal", () => {
    expect(Money.of("100.50", "ILS").toString()).toBe("100.5 ILS");
    expect(Money.of(3, "USD").toString()).toBe("3 USD");
    expect(Money.of(new Decimal("0.1"), "EUR").toString()).toBe("0.1 EUR");
  });

  it("rejects invalid currency and non-finite amounts", () => {
    expect(() => Money.of(1, "GBP" as never)).toThrow();
    expect(() => Money.of(Number.NaN, "ILS")).toThrow();
    expect(() => Money.of(Number.POSITIVE_INFINITY, "ILS")).toThrow();
  });

  it("adds and subtracts without float drift", () => {
    const a = Money.of("0.1", "ILS");
    const b = Money.of("0.2", "ILS");
    expect(a.add(b).toString()).toBe("0.3 ILS"); // 0.1 + 0.2 !== 0.30000000000000004
    expect(b.subtract(a).toString()).toBe("0.1 ILS");
  });

  it("forbids cross-currency arithmetic", () => {
    const ils = Money.of(100, "ILS");
    const usd = Money.of(100, "USD");
    expect(() => ils.add(usd)).toThrow(/FxConversion/);
    expect(() => ils.subtract(usd)).toThrow(/FxConversion/);
    expect(() => ils.compareTo(usd)).toThrow(/FxConversion/);
  });

  it("multiplies precisely", () => {
    expect(Money.of("100", "ILS").multiply("0.175").toString()).toBe("17.5 ILS");
  });

  it("is immutable", () => {
    const m = Money.of(5, "ILS");
    m.add(Money.of(1, "ILS"));
    expect(m.toString()).toBe("5 ILS");
    expect(Object.isFrozen(m)).toBe(true);
  });

  it("banker's rounding at the storage boundary only", () => {
    expect(Money.of("2.00005", "ILS").toStorage().amount).toBe("2.0000");
    expect(Money.of("2.00015", "ILS").toStorage().amount).toBe("2.0002");
    expect(Money.of("1.23456789", "USD").toStorage()).toEqual({
      amount: "1.2346",
      currency: "USD",
    });
  });

  it("associativity holds across many random-ish additions (no drift)", () => {
    const values = Array.from({ length: 500 }, (_, i) => `0.${String((i % 97) + 1).padStart(2, "0")}`);
    const left = values.reduce((acc, v) => acc.add(Money.of(v, "ILS")), Money.zero("ILS"));
    const right = values
      .slice()
      .reverse()
      .reduce((acc, v) => acc.add(Money.of(v, "ILS")), Money.zero("ILS"));
    expect(left.equals(right)).toBe(true);
  });
});
