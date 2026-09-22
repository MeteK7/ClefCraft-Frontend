import { DateUtils } from '../utils/date.utils';
import {
  RecurrenceRule
} from './recurrence-rule-parser';

export class RecurrenceExpander {

  static expand(
    startDate: Date,
    rule: RecurrenceRule,
    rangeStart: Date,
    rangeEnd: Date
  ): Date[] {

    const dates: Date[] = [];

    let current =
      new Date(startDate);

    let generated = 0;

    // Counts monthly/yearly steps taken from startDate, so each occurrence
    // is computed by anchoring back to startDate's day-of-month/time rather
    // than compounding off the previous (possibly clamped) occurrence.
    let steps = 0;

    while (current <= rangeEnd) {

      if (current >= rangeStart) {
        dates.push(new Date(current));
      }

      generated++;

      if (
        rule.count &&
        generated >= rule.count
      ) {
        break;
      }

      if (
        rule.until &&
        current > rule.until
      ) {
        break;
      }

      steps++;

      switch (rule.frequency) {

        case 'daily':
          current =
            DateUtils.addDays(
              current,
              rule.interval
            );
          break;

        case 'weekly':
          current =
            DateUtils.addDays(
              current,
              7 * rule.interval
            );
          break;

        case 'monthly':
          current =
            addMonthsAnchored(
              startDate,
              rule.interval * steps
            );
          break;

        case 'yearly':
          current =
            addMonthsAnchored(
              startDate,
              rule.interval * steps * 12
            );
          break;
      }
    }

    return dates;
  }
}

/**
 * Adds `months` to `anchor`, anchored back to anchor's original day-of-month
 * and time-of-day rather than the previous iteration's (possibly clamped)
 * date. Without this, a monthly/yearly rule starting on e.g. Jan 31 drifts
 * permanently once a short month clamps it (Jan 31 -> Feb 28 -> Mar 28
 * instead of back to the 31st), and plain `new Date(y, m, d)` construction
 * silently resets the time-of-day to midnight. Mirrors the backend's
 * startWallClock.AddMonths(interval * occurrenceIndex) strategy in
 * RecurrenceHelper.GenerateSimpleCandidates.
 */
function addMonthsAnchored(anchor: Date, months: number): Date {
  const targetMonthIndex = anchor.getMonth() + months;
  const daysInTargetMonth = new Date(
    anchor.getFullYear(),
    targetMonthIndex + 1,
    0
  ).getDate();

  const day = Math.min(anchor.getDate(), daysInTargetMonth);

  return new Date(
    anchor.getFullYear(),
    targetMonthIndex,
    day,
    anchor.getHours(),
    anchor.getMinutes(),
    anchor.getSeconds(),
    anchor.getMilliseconds()
  );
}