export class DateUtils {

  static readonly DAY_MS = 24 * 60 * 60 * 1000;

  // ── Normalisation ────────────────────────────────────────────────────────

  /**
   * Strips the time component and returns a midnight-local timestamp.
   * Use this whenever you only care about the calendar date, not the clock.
   */
  static toDateOnly(date: Date): number {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ).getTime();
  }

  /**
   * Returns a new Date at 00:00:00.000 local time on the same day.
   */
  static startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /**
   * Returns a new Date at 23:59:59.999 local time on the same day.
   */
  static endOfDay(date: Date): Date {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23, 59, 59, 999
    );
  }

  // ── Comparison ───────────────────────────────────────────────────────────

  /** True when both dates fall on the same calendar day (ignores time). */
  static isSameDate(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth()    &&
      a.getDate()     === b.getDate()
    );
  }

  /** True when `date` is today (ignores time). */
  static isToday(date: Date): boolean {
    return DateUtils.isSameDate(date, new Date());
  }

  // ── Arithmetic ───────────────────────────────────────────────────────────

  /** Returns a new Date that is `days` calendar days after `date`. */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /** Returns a new Date that is `months` calendar months after `date`. */
  static addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  /** Returns a new Date that is `years` calendar years after `date`. */
  static addYears(date: Date, years: number): Date {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
  }

  // ── Week helpers ─────────────────────────────────────────────────────────

  /**
   * Returns an array of 7 Dates for the ISO week (Mon → Sun) that
   * contains `date`.
   */
  static getWeekDates(date: Date): Date[] {
    const monday = new Date(date);
    const dayOffset = (date.getDay() + 6) % 7; // 0 = Monday
    monday.setDate(date.getDate() - dayOffset);
    return Array.from({ length: 7 }, (_, i) => DateUtils.addDays(monday, i));
  }

  /**
   * ISO 8601 week number (Monday-based).
   * Week 1 is the week containing the first Thursday of the year.
   */
  static getWeekNumber(date: Date): number {
    const target = new Date(date.getTime());
    target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    firstThursday.setDate(
      firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7)
    );
    return (
      1 +
      Math.floor(
        (target.getTime() - firstThursday.getTime()) /
        (7 * DateUtils.DAY_MS)
      )
    );
  }

  // ── Year helpers ─────────────────────────────────────────────────────────

  /**
   * 1-based ordinal day of the year (1 = Jan 1st).
   * Accounts for DST transitions.
   */
  static getDayOfYear(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff =
      date.getTime() -
      startOfYear.getTime() +
      (startOfYear.getTimezoneOffset() - date.getTimezoneOffset()) * 60_000;
    return Math.floor(diff / DateUtils.DAY_MS);
  }
}