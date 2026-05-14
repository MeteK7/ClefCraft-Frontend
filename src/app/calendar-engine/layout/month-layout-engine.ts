/** Minimal shape required by the engine; extend via the generic. */
export interface MonthEventInput {
  id: number;
  startDate: Date | string;
  endDate: Date | string;
  allDayEvent?: boolean;
}

export interface MonthLayoutItem<T> {
  event: T;
  /** 1-based column index within the week row (1–7). */
  columnStart: number;
  /** How many columns this event spans within the row. */
  columnSpan: number;
  /** 0-based lane (row) index; use to hide if ≥ MAX_VISIBLE_LANES. */
  lane: number;
}

/**
 * Computes lane + grid-column placement for multi-day / spanning events
 * in a month view row.
 *
 * Extracted from CalendarComponent to make the algorithm reusable and testable.
 */
export class MonthLayoutEngine {

  private static readonly DAY_MS = 24 * 60 * 60 * 1000;

  // Public API

  /**
   * @param events  All events that may be visible anywhere in the month.
   * @param week    Array of 7 Date objects representing one calendar row.
   */
  static generate<T extends MonthEventInput>(
    events: T[],
    week: Date[]
  ): MonthLayoutItem<T>[] {

    const weekStartMs = this.dateOnly(week[0]);
    const weekEndMs   = this.dateOnly(week[6]);

    // Filter to events that intersect this week
    const weekEvents = events.filter(e => {
      const start = this.dateOnly(new Date(e.startDate));
      let   end   = this.dateOnly(new Date(e.endDate));
      if (e.allDayEvent) end -= this.DAY_MS;
      return start <= weekEndMs && end >= weekStartMs;
    });

    // Sort by start so earlier events get lower lanes
    const sorted = [...weekEvents].sort(
      (a, b) =>
        new Date(a.startDate).getTime() -
        new Date(b.startDate).getTime()
    );

    const lanes: T[][] = [];
    const result: MonthLayoutItem<T>[] = [];

    for (const event of sorted) {

      const colStart = this.columnStart(event, weekStartMs);
      const colSpan  = this.columnSpan(event, weekStartMs, weekEndMs);

      // Place into the first lane without a collision
      let placedLane = -1;

      for (let i = 0; i < lanes.length; i++) {
        const hasOverlap = lanes[i].some(e =>
          this.eventsOverlap(e, event, weekStartMs, weekEndMs)
        );
        if (!hasOverlap) {
          lanes[i].push(event);
          placedLane = i;
          break;
        }
      }

      if (placedLane === -1) {
        lanes.push([event]);
        placedLane = lanes.length - 1;
      }

      result.push({ event, columnStart: colStart, columnSpan: colSpan, lane: placedLane });
    }

    return result;
  }

  // Geometry helpers (also useful in component)

  /**
   * 1-based column index of an event's effective start within the week.
   * Clamped so events starting before the week begin at column 1.
   */
  static columnStart<T extends MonthEventInput>(
    event: T,
    weekStartMs: number
  ): number {
    const start = this.dateOnly(new Date(event.startDate));
    const effective = Math.max(start, weekStartMs);
    return Math.floor((effective - weekStartMs) / this.DAY_MS) + 1;
  }

  /**
   * How many columns the event spans in this week row.
   * Clamped to [1, 7].
   */
  static columnSpan<T extends MonthEventInput>(
    event: T,
    weekStartMs: number,
    weekEndMs: number
  ): number {
    const start = this.dateOnly(new Date(event.startDate));
    let   end   = this.dateOnly(new Date(event.endDate));
    if (event.allDayEvent) end -= this.DAY_MS;

    const effectiveStart = Math.max(start, weekStartMs);
    const effectiveEnd   = Math.min(end,   weekEndMs);

    const diff = Math.floor((effectiveEnd - effectiveStart) / this.DAY_MS);
    return Math.max(1, diff + 1);
  }

  // Private helpers

  private static eventsOverlap<T extends MonthEventInput>(
    a: T,
    b: T,
    weekStartMs: number,
    weekEndMs: number
  ): boolean {
    const aStart = this.columnStart(a, weekStartMs);
    const aEnd   = aStart + this.columnSpan(a, weekStartMs, weekEndMs) - 1;
    const bStart = this.columnStart(b, weekStartMs);
    const bEnd   = bStart + this.columnSpan(b, weekStartMs, weekEndMs) - 1;
    return !(aEnd < bStart || bEnd < aStart);
  }

  private static dateOnly(date: Date): number {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ).getTime();
  }
}