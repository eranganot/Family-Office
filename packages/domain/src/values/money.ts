import Decimal from "decimal.js";
import { CurrencyCodeSchema, type CurrencyCode } from "./currency-code";

/**
 * Money value object. Immutable. Decimal arithmetic only — never floats.
 * Cross-currency arithmetic is forbidden; conversions require an explicit FxConversion
 * (introduced with the NetWorthCalculator in M1).
 */
export class Money {
  readonly amount: Decimal;
  readonly currency: CurrencyCode;

  private constructor(amount: Decimal, currency: CurrencyCode) {
    this.amount = amount;
    this.currency = currency;
    Object.freeze(this);
  }

  static of(amount: string | number | Decimal, currency: CurrencyCode): Money {
    CurrencyCodeSchema.parse(currency);
    const d = new Decimal(amount);
    if (!d.isFinite()) throw new Error("Money amount must be finite");
    return new Money(d, currency);
  }

  static zero(currency: CurrencyCode): Money {
    return Money.of(0, currency);
  }

  private assertSameCurrency(other: Money, op: string): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Cannot ${op} ${this.currency} and ${other.currency}: cross-currency arithmetic requires an explicit FxConversion`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other, "add");
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other, "subtract");
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  multiply(factor: string | number | Decimal): Money {
    const f = new Decimal(factor);
    if (!f.isFinite()) throw new Error("Multiplication factor must be finite");
    return new Money(this.amount.times(f), this.currency);
  }

  negate(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  compareTo(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other, "compare");
    return this.amount.comparedTo(other.amount) as -1 | 0 | 1;
  }

  /** Banker's rounding to 4 decimal places — used only at persistence boundaries. */
  toStorage(): { amount: string; currency: CurrencyCode } {
    return {
      amount: this.amount.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN).toFixed(4),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency}`;
  }
}
