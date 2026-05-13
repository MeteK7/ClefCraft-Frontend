export interface CalendarLayoutItem<T = any> {

  event: T;

  top: number;
  height: number;

  left: number;
  width: number;

  lane: number;
  laneCount: number;
}