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

/**
 * Minimum shape required for time-grid (day / week) layout.
 * The concrete event type used by the app (CalendarEventUI) satisfies this.
 */
export interface TimeGridEventInput {
  id: number;
  startDate: Date;
  endDate: Date;
  allDayEvent?: boolean;
}

/**
 * Minimum shape required for recurrence expansion.
 */
export interface RecurringEventInput extends TimeGridEventInput {
  recurrenceRule?: string;
}

/**
 * Orchestrates the calendar-engine pipeline:
 *
 *  1. Recurrence expansion   – turn a base event + rule into N occurrences
 *  2. Exception application  – suppress/patch individual occurrences
 *  3. Normalisation          – convert domain dates to EngineEvent timestamps
 *  4. Layout generation      – produce pixel-positioned CalendarLayoutItem[]
 *                              or column-positioned MonthLayoutItem[]
 *
 * All methods are generic so the service stays independent of any
 * specific UI model (CalendarEventUI lives in the pages layer, not here).
 */
@Injectable({ providedIn: 'root' })
export class CalendarEngineService {

  // ── Recurrence ─────────────────────────────────────────────────────────────

  /**
   * Expands every recurring event in `events` into individual occurrences
   * within [rangeStart, rangeEnd], and leaves non-recurring events as-is.
   *
   * Optionally applies `exceptions` to filter/patch the expanded occurrences.
   */
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

  // ── Layout: day / week (time-grid) ─────────────────────────────────────────

  /**
   * Returns pixel-positioned layout items for rendering events in a
   * day-view or week-view time column.
   *
   * All-day events are excluded from the output (they belong in the
   * all-day banner above the grid).
   */
  getDayTimeLayouts<T extends TimeGridEventInput>(
    events: T[]
  ): CalendarLayoutItem<T>[] {

    const normalized = EventNormalizer.normalize(events);
    return TimeBlockLayoutEngine.generate(normalized) as CalendarLayoutItem<T>[];
  }

  // ── Layout: month ──────────────────────────────────────────────────────────

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
