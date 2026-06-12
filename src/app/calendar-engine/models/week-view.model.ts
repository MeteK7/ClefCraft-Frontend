import { CalendarLayoutItem } from '../models/calendar-layout-item.model';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

export interface WeekDayColumn {
  date: Date;
  isToday: boolean;
  layoutItems: CalendarLayoutItem<CalendarEventUI>[];
  allDayEvents: CalendarEventUI[];
}

export interface WeekViewModel {
  viewStartDate: Date;
  viewEndDate: Date;
  columns: WeekDayColumn[];
}