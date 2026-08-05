import { MonthWeekRow } from './month-view.model';

/**
 * A bounded, sliding window of loaded week rows for the infinite-scroll
 * month view. This deliberately has no concept of "a month" — it's just
 * "weeks[0].dates[0] (Monday) through weeks[last].dates[6] (Sunday)".
 */
export interface MonthScrollWindow {
  /** Ordered oldest (top) → newest (bottom). */
  weeks: MonthWeekRow[];
  /** Monday of weeks[0]. Kept denormalized for cheap range checks. */
  loadedStart: Date;
  /** Sunday (end of day) of weeks[weeks.length - 1]. */
  loadedEnd: Date;
}
