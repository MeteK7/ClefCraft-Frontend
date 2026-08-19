import { MonthScrollWindow } from '../models/month-scroll-window.model';
import { MonthWeekRow } from '../models/month-view.model';
import { WeekRowGenerator } from '../generators/week-row.generator';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { DateUtils } from '../utils/date.utils';

/**
 * Pure, stateless engine for building and mutating a MonthScrollWindow.
 * Kept as static methods (same style as MonthLayoutEngine)
 * so it's trivially unit-testable without Angular DI.
 *
 * The component/service layer owns the actual MonthScrollWindow instance;
 * this engine just computes the next value.
 */
export class MonthScrollEngine {

  /** Default number of weeks kept loaded above/below the viewport before pruning. */
  static readonly DEFAULT_PRUNE_MARGIN_WEEKS = 8;

  /**
   * Builds an initial window centered on `centerDate`.
   *
   * @param centerDate    Date to center the window on (e.g. selectedDate / today).
   * @param events        Candidate events (already fetched for the range you intend to load).
   * @param weeksBefore   How many weeks to load above the center week.
   * @param weeksAfter    How many weeks to load below the center week.
   */
  static initialize(
    centerDate: Date,
    events: CalendarEventUI[],
    weeksBefore: number,
    weeksAfter: number,
  ): MonthScrollWindow {
    const centerWeekStart = DateUtils.startOfWeek(centerDate);
    let topWeekStart = centerWeekStart;
    for (let i = 0; i < weeksBefore; i++) {
      topWeekStart = WeekRowGenerator.previousWeekStart(topWeekStart);
    }

    const weeks: MonthWeekRow[] = [];
    let cursor = topWeekStart;
    const totalWeeks = weeksBefore + 1 + weeksAfter;

    for (let i = 0; i < totalWeeks; i++) {
      weeks.push(WeekRowGenerator.generate(cursor, events));
      cursor = WeekRowGenerator.nextWeekStart(cursor);
    }

    return this.buildWindow(weeks);
  }

  /** Appends `count` new weeks below the current window (scrolling down). */
  static appendWeeks(window: MonthScrollWindow, count: number, events: CalendarEventUI[]): MonthScrollWindow {
    if (count <= 0) return window;

    const newWeeks: MonthWeekRow[] = [];
    const lastWeekStart = window.weeks[window.weeks.length - 1].dates[0];
    let cursor = WeekRowGenerator.nextWeekStart(lastWeekStart);

    for (let i = 0; i < count; i++) {
      newWeeks.push(WeekRowGenerator.generate(cursor, events));
      cursor = WeekRowGenerator.nextWeekStart(cursor);
    }

    return this.buildWindow([...window.weeks, ...newWeeks]);
  }

  /**
   * Prepends `count` new weeks above the current window (scrolling up).
   * Caller is responsible for adjusting scrollTop by the resulting added
   * pixel height (rowCountAdded * rowHeight) in the same tick, so the
   * viewport doesn't visually jump. See MonthScrollViewComponent.
   */
  static prependWeeks(window: MonthScrollWindow, count: number, events: CalendarEventUI[]): MonthScrollWindow {
    if (count <= 0) return window;

    const newWeeks: MonthWeekRow[] = [];
    let cursor = window.weeks[0].dates[0];

    for (let i = 0; i < count; i++) {
      cursor = WeekRowGenerator.previousWeekStart(cursor);
      newWeeks.unshift(WeekRowGenerator.generate(cursor, events));
    }

    return this.buildWindow([...newWeeks, ...window.weeks]);
  }

  /**
   * Drops weeks from the bottom of the window, keeping at most
   * `maxWeeks` total rows measured from the top. Used when the user has
   * scrolled far down and old weeks at the top are no longer needed... 
   * actually pruning direction is decided by the caller (see pruneHead/pruneTail).
   */
  static pruneTail(window: MonthScrollWindow, maxWeeks: number): MonthScrollWindow {
    if (window.weeks.length <= maxWeeks) return window;
    const trimmed = window.weeks.slice(0, maxWeeks);
    return this.buildWindow(trimmed);
  }

  /** Drops weeks from the top of the window, keeping the most recent `maxWeeks` rows. */
  static pruneHead(window: MonthScrollWindow, maxWeeks: number): MonthScrollWindow {
    if (window.weeks.length <= maxWeeks) return window;
    const trimmed = window.weeks.slice(window.weeks.length - maxWeeks);
    return this.buildWindow(trimmed);
  }

  /**
   * Recomputes layout for a single week row in place (by index), leaving
   * every other row's array reference untouched. Used during drag/resize
   * so we don't pay for a full-window relayout on every mousemove.
   */
  static recomputeWeek(window: MonthScrollWindow, weekIndex: number, events: CalendarEventUI[]): MonthScrollWindow {
    if (weekIndex < 0 || weekIndex >= window.weeks.length) return window;

    const weekStart = window.weeks[weekIndex].dates[0];
    const recomputed = WeekRowGenerator.generate(weekStart, events);

    const weeks = window.weeks.slice();
    weeks[weekIndex] = recomputed;

    return { ...window, weeks };
  }

  /**
   * Recomputes layout for every currently-loaded row against a fresh
   * events array, without changing which weeks are loaded. Use this after
   * an incremental fetch brings in events that might affect existing rows
   * (e.g. a multi-day event whose span now overlaps already-rendered weeks).
   */
  static recomputeAllWeeks(window: MonthScrollWindow, events: CalendarEventUI[]): MonthScrollWindow {
    const weeks = window.weeks.map(row => WeekRowGenerator.generate(row.dates[0], events));
    return this.buildWindow(weeks);
  }

  /** Recomputes layout for whichever row(s) contain the given date (handles multi-day events spanning weeks not needed here — a date belongs to exactly one row). */
  static recomputeWeekForDate(window: MonthScrollWindow, date: Date, events: CalendarEventUI[]): MonthScrollWindow {
    const idx = this.findWeekIndexForDate(window, date);
    if (idx === -1) return window;
    return this.recomputeWeek(window, idx, events);
  }

  /** Index of the row containing `date`, or -1 if outside the loaded window. */
  static findWeekIndexForDate(window: MonthScrollWindow, date: Date): number {
    const dayMs = DateUtils.toDateOnly(date);
    return window.weeks.findIndex(row => {
      const start = DateUtils.toDateOnly(row.dates[0]);
      const end = DateUtils.toDateOnly(row.dates[6]);
      return dayMs >= start && dayMs <= end;
    });
  }

  /**
   * Picks the month that owns the majority of days across the given rows.
   * Callers typically pass a single anchor row (e.g. whichever week row is
   * topmost in the scroll viewport) so a boundary row — one containing the
   * 1st, with days split across two months — resolves to whichever month
   * has more days in that row.
   */
  static getDominantMonthForVisibleRows(rows: MonthWeekRow[]): { year: number; month: number } {
    const counts = new Map<string, { year: number; month: number; count: number }>();

    for (const row of rows) {
      for (const date of row.dates) {
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        const entry = counts.get(key) ?? { year: date.getFullYear(), month: date.getMonth(), count: 0 };
        entry.count++;
        counts.set(key, entry);
      }
    }

    let best = { year: rows[0].dates[0].getFullYear(), month: rows[0].dates[0].getMonth(), count: -1 };
    for (const entry of counts.values()) {
      if (entry.count > best.count) best = entry;
    }
    return { year: best.year, month: best.month };
  }

  // ── internal ───────────────────────────────────────────────────────────

  private static buildWindow(weeks: MonthWeekRow[]): MonthScrollWindow {
    const loadedStart = new Date(weeks[0].dates[0]);
    const loadedEnd = new Date(weeks[weeks.length - 1].dates[6]);
    loadedEnd.setHours(23, 59, 59, 999);

    return { weeks, loadedStart, loadedEnd };
  }
}
