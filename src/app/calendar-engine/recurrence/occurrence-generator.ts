import { RecurrenceExpander }
  from './recurrence-expander';

import {
  RecurrenceRuleParser
} from './recurrence-rule-parser';

export class OccurrenceGenerator {

  static generateOccurrences<T extends {
    recurrenceRule?: string;
    startDate: Date;
    endDate: Date;
  }>(
    event: T,
    rangeStart: Date,
    rangeEnd: Date
  ): T[] {

    if (!event.recurrenceRule) {
      return [event];
    }

    const rule =
      RecurrenceRuleParser.parse(
        event.recurrenceRule
      );

    const occurrences =
      RecurrenceExpander.expand(
        event.startDate,
        rule,
        rangeStart,
        rangeEnd
      );

    const duration =
      event.endDate.getTime()
      - event.startDate.getTime();

    return occurrences.map(date => ({

      ...event,

      startDate: new Date(date),

      endDate: new Date(
        date.getTime() + duration
      )
    }));
  }
}