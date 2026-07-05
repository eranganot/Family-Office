/** Date range with optional open end. Invariant: end >= start. */
export class DateRange {
  readonly start: Date;
  readonly end: Date | undefined;

  private constructor(start: Date, end?: Date) {
    this.start = start;
    this.end = end;
    Object.freeze(this);
  }

  static of(start: Date, end?: Date): DateRange {
    if (Number.isNaN(start.getTime())) throw new Error("Invalid start date");
    if (end !== undefined) {
      if (Number.isNaN(end.getTime())) throw new Error("Invalid end date");
      if (end.getTime() < start.getTime()) throw new Error("DateRange end must be >= start");
    }
    return new DateRange(start, end);
  }

  contains(date: Date): boolean {
    const t = date.getTime();
    if (t < this.start.getTime()) return false;
    return this.end === undefined || t <= this.end.getTime();
  }

  isOpenEnded(): boolean {
    return this.end === undefined;
  }
}
