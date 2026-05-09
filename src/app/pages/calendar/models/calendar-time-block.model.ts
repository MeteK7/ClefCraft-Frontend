import { CalendarEventUI } from './calendar-event.model-ui';

export interface CalendarTimeBlock extends CalendarEventUI {
  top: number;
  height: number;
  left: number;
  width: number;
  overlapIndex: number;
  overlapCount: number;
}