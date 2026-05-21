import { SnapEngine } from '../snap/snap-engine';
import { DragPositionUtil } from '../drag/drag-position.util';

export class EventResizeEngine {

  static resizeTop(
    originalStart: Date,
    originalEnd: Date,
    deltaY: number
  ): { start: Date; end: Date } {

    const deltaMinutes =
      SnapEngine.snapMinutes(
        DragPositionUtil.pixelsToMinutes(deltaY)
      );

    const start = new Date(originalStart);
    start.setMinutes(start.getMinutes() + deltaMinutes);

    if (start >= originalEnd) {
      start.setTime(originalEnd.getTime() - 15 * 60 * 1000);
    }

    return {
      start,
      end: new Date(originalEnd),
    };
  }

  static resizeBottom(
    originalStart: Date,
    originalEnd: Date,
    deltaY: number
  ): { start: Date; end: Date } {

    const deltaMinutes =
      SnapEngine.snapMinutes(
        DragPositionUtil.pixelsToMinutes(deltaY)
      );

    const end = new Date(originalEnd);
    end.setMinutes(end.getMinutes() + deltaMinutes);

    if (end <= originalStart) {
      end.setTime(originalStart.getTime() + 15 * 60 * 1000);
    }

    return {
      start: new Date(originalStart),
      end,
    };
  }
}