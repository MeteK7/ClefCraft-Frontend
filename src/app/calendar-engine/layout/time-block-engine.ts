/**
 * Pure utility class for converting between timestamps / minutes
 * and pixel positions in a 24-hour time grid.
 *
 * Centralises HOUR_HEIGHT so every layout engine uses the same constant.
 */
export class TimeBlockEngine {

  static readonly HOUR_HEIGHT = 80; // px per hour

  // Pixel calculations

  /** Top offset (px) from the start-of-day for a given timestamp. */
  static topFromTimestamp(timestamp: number): number {
    const date = new Date(timestamp);
    const minutes = date.getHours() * 60 + date.getMinutes();
    return (minutes / 60) * this.HOUR_HEIGHT;
  }

  /**
   * Height (px) for an event spanning from `start` to `end` (ms timestamps).
   * Enforces a minimum of 15 minutes so very short events remain visible.
   */
  static heightFromTimestamps(start: number, end: number): number {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();

    const durationMinutes = Math.max(endMinutes - startMinutes, 15);

    return (durationMinutes / 60) * this.HOUR_HEIGHT;
  }

  // Reverse calculations (pixel → time)

  /** Minutes from top-of-grid for a given pixel offset. */
  static minutesFromTop(top: number): number {
    return (top / this.HOUR_HEIGHT) * 60;
  }

  /** Returns the pixel top for the current time (now indicator). */
  static nowTop(): number {
    const now = new Date();
    return this.topFromTimestamp(now.getTime());
  }

  // Total grid height

  /** Full height (px) of a 24-hour grid. */
  static get GRID_HEIGHT(): number {
    return 24 * this.HOUR_HEIGHT;
  }
}