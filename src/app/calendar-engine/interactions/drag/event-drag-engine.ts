import { SnapEngine } from '../snap/snap-engine';
import { DragPositionUtil } from './drag-position.util';

export class EventDragEngine {

  static calculateMinuteDelta(deltaY: number): number {

    const rawMinutes =
      DragPositionUtil.pixelsToMinutes(deltaY);

    return SnapEngine.snapMinutes(rawMinutes);
  }

  static moveDates(
    start: Date,
    end: Date,
    minuteDelta: number
  ): { start: Date; end: Date } {

    const newStart = new Date(start);
    const newEnd = new Date(end);

    newStart.setMinutes(newStart.getMinutes() + minuteDelta);
    newEnd.setMinutes(newEnd.getMinutes() + minuteDelta);

    return {
      start: newStart,
      end: newEnd,
    };
  }
}