import Decimal from "decimal.js";

/** Percentage in [0, 100]. One convention everywhere: human-readable percent, not ratio. */
export class Percentage {
  readonly value: Decimal;

  private constructor(value: Decimal) {
    this.value = value;
    Object.freeze(this);
  }

  static of(value: string | number | Decimal): Percentage {
    const d = new Decimal(value);
    if (!d.isFinite() || d.lt(0) || d.gt(100)) {
      throw new Error(`Percentage must be within [0, 100], got ${d.toString()}`);
    }
    return new Percentage(d);
  }

  asRatio(): Decimal {
    return this.value.dividedBy(100);
  }

  equals(other: Percentage): boolean {
    return this.value.equals(other.value);
  }

  toString(): string {
    return `${this.value.toString()}%`;
  }
}
