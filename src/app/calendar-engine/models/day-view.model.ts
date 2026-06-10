import { CalendarTimeBlock } from '../../models/calendar-time-block';

export interface DayViewModel<T> {
  date: Date;
  blocks: CalendarTimeBlock[];
  events: T[];
}