import { DateUtils } from './date.utils';

describe('DateUtils', () => {
  // 2026-05-11 is a Monday; dates are local so the tests hold in any timezone.
  const monday = new Date(2026, 4, 11);

  it('toDateOnly drops the time of day', () => {
    expect(DateUtils.toDateOnly(new Date(2026, 4, 13, 15, 30))).toBe(new Date(2026, 4, 13).getTime());
  });

  it('isSameDate compares the calendar day only', () => {
    expect(DateUtils.isSameDate(new Date(2026, 4, 13, 0, 1), new Date(2026, 4, 13, 23, 59))).toBeTrue();
    expect(DateUtils.isSameDate(new Date(2026, 4, 13, 23, 59), new Date(2026, 4, 14, 0, 0))).toBeFalse();
  });

  it('addDays crosses month ends, goes backwards and leaves its input alone', () => {
    const input = new Date(2026, 0, 30, 9, 0);

    expect(DateUtils.addDays(input, 3)).toEqual(new Date(2026, 1, 2, 9, 0));
    expect(DateUtils.addDays(input, -30)).toEqual(new Date(2025, 11, 31, 9, 0));
    expect(input).toEqual(new Date(2026, 0, 30, 9, 0));
  });

  it('startOfWeek returns the Monday at midnight', () => {
    expect(DateUtils.startOfWeek(new Date(2026, 4, 13, 18, 0))).toEqual(monday); // Wednesday
    expect(DateUtils.startOfWeek(new Date(2026, 4, 17, 12, 0))).toEqual(monday); // Sunday
    expect(DateUtils.startOfWeek(new Date(2026, 4, 11, 8, 0))).toEqual(monday); // Monday itself
  });

  it('endOfWeek returns the last millisecond of Sunday', () => {
    expect(DateUtils.endOfWeek(new Date(2026, 4, 13))).toEqual(new Date(2026, 4, 17, 23, 59, 59, 999));
  });

  it('rangesIntersect treats touching edges as intersecting', () => {
    expect(DateUtils.rangesIntersect(0, 10, 10, 20)).toBeTrue();
    expect(DateUtils.rangesIntersect(0, 9, 10, 20)).toBeFalse();
    expect(DateUtils.rangesIntersect(0, 30, 10, 20)).toBeTrue();
  });
});
