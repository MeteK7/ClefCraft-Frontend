import { CalendarLayoutItem } from '../layout/calendar-layout-item';

export interface WeekViewModel<T> {
  dates: Date[];
  layoutItems: CalendarLayoutItem<T>[];
}