import { CalendarTimeBlock } from '../../../models/calendar-time-block.model';

export interface ResizeSession {

  event: CalendarTimeBlock;

  direction: 'top' | 'bottom';

  startMouseY: number;

  originalStart: Date;
  originalEnd: Date;

  originalTop: number;
  originalHeight: number;
}