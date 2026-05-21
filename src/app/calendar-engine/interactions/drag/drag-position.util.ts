import { TimeBlockEngine } from '../../layout/time-block-engine';

export class DragPositionUtil {

  static pixelsToMinutes(deltaY: number): number {
    return (deltaY / TimeBlockEngine.HOUR_HEIGHT) * 60;
  }

  static minutesToPixels(minutes: number): number {
    return (minutes / 60) * TimeBlockEngine.HOUR_HEIGHT;
  }
}