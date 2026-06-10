import { Injectable } from '@angular/core';

import { CalendarLayoutItem } from '../models/calendar-layout-item.model';
import { MonthEventInput, MonthLayoutEngine, MonthLayoutItem } from '../layout/month-layout-engine';
import { TimeBlockLayoutEngine } from '../layout/time-block-layout-engine';
import { EventNormalizer } from '../utils/event-normalizer';
import { OccurrenceGenerator } from '../recurrence/occurrence-generator';
import {
  RecurrenceException,
  RecurrenceExceptionEngine,
} from '../recurrence/recurrence-exception-engine';

export interface TimeGridEventInput {
  id: number;
  startDate: Date;
  endDate: Date;
  allDayEvent?: boolean;
}

export interface RecurringEventInput extends TimeGridEventInput {
  recurrenceRule?: string;
}

@Injectable({ providedIn: 'root' })
export class CalendarEngineService {

  expandRecurring<T extends RecurringEventInput>(
    events: T[],
    rangeStart: Date,
    rangeEnd: Date,
    exceptions: RecurrenceException[] = []
  ): T[] {

    const result: T[] = [];

    for (const event of events) {

      if (!event.recurrenceRule) {
        result.push(event);
        continue;
      }

      const baseId = (event as any).id as number;

      let occurrences = OccurrenceGenerator.generateOccurrences(
        { ...event, startDate: new Date(event.startDate), endDate: new Date(event.endDate) },
        rangeStart,
        rangeEnd
      ) as T[];

      if (exceptions.length) {
        occurrences = RecurrenceExceptionEngine.applyForBaseEvent(
          occurrences,
          baseId,
          exceptions
        ) as T[];
      }

      result.push(...occurrences);
    }

    return result;
  }

  getDayTimeLayouts<T extends TimeGridEventInput>(
    events: T[]
  ): CalendarLayoutItem<T>[] {

    const normalized = EventNormalizer.normalize(events);
    return TimeBlockLayoutEngine.generate(normalized) as CalendarLayoutItem<T>[];
  }

  /**
   * Returns column/lane-positioned layout items for rendering multi-day
   * and spanning events in one month-view week row.
   *
   * @param events  Full event list (engine filters to the relevant week).
   * @param week    Array of 7 Date objects for the target week row.
   */
  getMonthWeekLayouts<T extends MonthEventInput>(
    events: T[],
    week: Date[]
  ): MonthLayoutItem<T>[] {

    return MonthLayoutEngine.generate(events, week);
  }
}
