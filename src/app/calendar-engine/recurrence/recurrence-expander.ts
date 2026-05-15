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
            new Date(
              current.getFullYear(),
              current.getMonth()
                + rule.interval,
              current.getDate()
            );
          break;

        case 'yearly':
          current =
            new Date(
              current.getFullYear()
                + rule.interval,
              current.getMonth(),
              current.getDate()
            );
          break;
      }
    }

    return dates;
  }
}