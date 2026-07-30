import { SnapEngine } from '../snap/snap-engine';
import { DragPositionUtil } from '../drag/drag-position.util';

export class EventCreateEngine {

  static readonly DEFAULT_DURATION_MINUTES = 15;
  static readonly MINUTES_PER_DAY = 24 * 60;

  /** Snapped-down minute-of-day, used for the click case and the drag anchor. */
  static yToMinutes(offsetY: number): number {
    return SnapEngine.floorAndClamp(DragPositionUtil.pixelsToMinutes(offsetY));
  }

  /** Raw, unsnapped minute-of-day — used to track the live pointer position during a drag. */
  static yToRawMinutes(offsetY: number): number {
    return SnapEngine.clampMinutes(DragPositionUtil.pixelsToMinutes(offsetY));
  }

  static buildClickRange(startMinutes: number): { startMinutes: number; endMinutes: number } {
    let start = startMinutes;
    let end = Math.min(start + this.DEFAULT_DURATION_MINUTES, this.MINUTES_PER_DAY);

    if (end - start < SnapEngine.SNAP_MINUTES) {
      start = end - SnapEngine.SNAP_MINUTES;
    }

    return { startMinutes: start, endMinutes: end };
  }

  static buildDragRange(
    anchorMinutes: number,
    currentRawMinutes: number
  ): { startMinutes: number; endMinutes: number } {
    let start: number;
    let end: number;

    if (currentRawMinutes >= anchorMinutes) {
      start = anchorMinutes;
      end = SnapEngine.ceilAndClamp(currentRawMinutes);
    } else {
      end = anchorMinutes + SnapEngine.SNAP_MINUTES;
      start = SnapEngine.floorAndClamp(currentRawMinutes);
    }

    if (end - start < SnapEngine.SNAP_MINUTES) {
      end = Math.min(start + SnapEngine.SNAP_MINUTES, this.MINUTES_PER_DAY);
      if (end - start < SnapEngine.SNAP_MINUTES) {
        start = end - SnapEngine.SNAP_MINUTES;
      }
    }

    return { startMinutes: start, endMinutes: end };
  }

  static minutesToDate(day: Date, minutes: number): Date {
    const result = new Date(day);
    result.setHours(0, 0, 0, 0);
    result.setMinutes(minutes);
    return result;
  }
}