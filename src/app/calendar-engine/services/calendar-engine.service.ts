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
import { WeekViewGenerator } from '../generators/week-view.generator';
import { WeekViewModel } from '../models/week-view.model';
import { DayViewGenerator } from '../generators/day-view.generator';
import { DayViewModel } from '../models/day-view.model';
import { AgendaViewGenerator } from '../generators/agenda-view.generator';
import { AgendaDayGroup } from '../../models/agenda-day-group.model';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { MonthScrollWindow } from '../models/month-scroll-window.model';
import { MonthScrollEngine } from './month-scroll-engine';

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

  buildWeekView(selectedDate: Date, events: CalendarEventUI[]): WeekViewModel {
    return WeekViewGenerator.generate(selectedDate, events);
  }

  buildDayView(selectedDate: Date, events: CalendarEventUI[]): DayViewModel {
    return DayViewGenerator.generate(selectedDate, events);
  }

  buildAgendaView(selectedDate: Date, events: CalendarEventUI[]): AgendaDayGroup[] {
    return AgendaViewGenerator.generate(selectedDate, events);
  }

  // ==========================================================================
  // MONTH SCROLL WINDOW (infinite-scroll month view)
  // ==========================================================================

  /**
   * Builds the initial MonthScrollWindow centered on `centerDate`.
   * `weeksBefore`/`weeksAfter` control how many weeks are preloaded above
   * and below the fold on first render.
   */
  initializeMonthScrollWindow(
    centerDate: Date,
    events: CalendarEventUI[],
    weeksBefore: number = 6,
    weeksAfter: number = 8,
  ): MonthScrollWindow {
    return MonthScrollEngine.initialize(centerDate, events, weeksBefore, weeksAfter);
  }

  appendMonthScrollWeeks(
    window: MonthScrollWindow,
    count: number,
    events: CalendarEventUI[],
  ): MonthScrollWindow {
    return MonthScrollEngine.appendWeeks(window, count, events);
  }

  prependMonthScrollWeeks(
    window: MonthScrollWindow,
    count: number,
    events: CalendarEventUI[],
  ): MonthScrollWindow {
    return MonthScrollEngine.prependWeeks(window, count, events);
  }

  pruneMonthScrollWindow(
    window: MonthScrollWindow,
    maxWeeks: number,
    direction: 'head' | 'tail',
  ): MonthScrollWindow {
    return direction === 'head'
      ? MonthScrollEngine.pruneHead(window, maxWeeks)
      : MonthScrollEngine.pruneTail(window, maxWeeks);
  }

  recomputeAllMonthScrollWeeks(
    window: MonthScrollWindow,
    events: CalendarEventUI[],
  ): MonthScrollWindow {
    return MonthScrollEngine.recomputeAllWeeks(window, events);
  }

  recomputeMonthScrollWeekForDate(
    window: MonthScrollWindow,
    date: Date,
    events: CalendarEventUI[],
  ): MonthScrollWindow {
    return MonthScrollEngine.recomputeWeekForDate(window, date, events);
  }
}
