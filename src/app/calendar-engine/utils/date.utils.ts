export class DateUtils {

  static readonly DAY_MS =
    24 * 60 * 60 * 1000;

  static toDateOnly(date: Date): number {

    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ).getTime();
  }

  static isSameDate(
    a: Date,
    b: Date
  ): boolean {

    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  static addDays(
    date: Date,
    days: number
  ): Date {

    const d = new Date(date);

    d.setDate(d.getDate() + days);

    return d;
  }

  static startOfWeek(date: Date): Date {

    const d = new Date(date);

    const day =
      (d.getDay() + 6) % 7;

    d.setDate(d.getDate() - day);

    d.setHours(0, 0, 0, 0);

    return d;
  }

  static endOfWeek(date: Date): Date {

    const start =
      this.startOfWeek(date);

    const end =
      this.addDays(start, 6);

    end.setHours(
      23, 59, 59, 999
    );

    return end;
  }

  static rangesIntersect(
    startA: number,
    endA: number,
    startB: number,
    endB: number
  ): boolean {

    return startA <= endB &&
      endA >= startB;
  }
}