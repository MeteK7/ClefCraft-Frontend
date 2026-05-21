import { CalendarTimeBlock } from '../../../models/calendar-time-block.model';

export interface DragSession {

  event: CalendarTimeBlock;

  startMouseY: number;
  startMouseX: number;

  originalStart: Date;
  originalEnd: Date;

  originalTop: number;

  sourceDate: Date;
}