import { MonthWeekRow } from '../models/month-view.model';
import { MonthLayoutEngine } from '../layout/month-layout-engine';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { DateUtils } from '../utils/date.utils';

/**
 * Builds a single week row (Mon..Sun) for the month view.
 *
 * Reused as the atomic unit of the infinite-scroll month view
 * (MonthScrollEngine appends/prepends one row at a time).
 *
 * This file intentionally has ZERO knowledge of "month boundaries" —
 * it only knows how to build the row that starts on a given Monday.
 */
export class WeekRowGenerator {

  /**
   * @param weekStart  Must be a Monday at 00:00:00.000 local time.
   *                   Callers are responsible for normalizing (see
   *                   DateUtils.startOfWeek) before calling this.
   * @param events     Full/candidate event list; layout engine filters
   *                   internally to whatever intersects this week.
   */
  static generate(weekStart: Date, events: CalendarEventUI[]): MonthWeekRow {
    const normalizedStart = DateUtils.startOfWeek(weekStart);

    const dates: Date[] = [];
    const running = new Date(normalizedStart);

    for (let d = 0; d < 7; d++) {
      dates.push(new Date(running));
      running.setDate(running.getDate() + 1);
    }

    const layoutItems = MonthLayoutEngine.generate(events, dates);

    return {
      weekStartTimestamp: dates[0].getTime(),
      dates,
      layoutItems,
    };
  }

  /** Convenience: the Monday that follows a given week's Monday. */
  static nextWeekStart(weekStart: Date): Date {
    return DateUtils.addDays(DateUtils.startOfWeek(weekStart), 7);
  }

  /** Convenience: the Monday that precedes a given week's Monday. */
  static previousWeekStart(weekStart: Date): Date {
    return DateUtils.addDays(DateUtils.startOfWeek(weekStart), -7);
  }
}
