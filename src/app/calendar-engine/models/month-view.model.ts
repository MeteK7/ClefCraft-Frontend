import { MonthLayoutItem } from '../layout/month-layout-engine';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

export interface MonthWeekRow {
  weekStartTimestamp: number;
  dates: Date[];
  layoutItems: MonthLayoutItem<CalendarEventUI>[];
}

export interface MonthViewModel {
  viewStartDate: Date;
  viewEndDate: Date;
  weeks: MonthWeekRow[];
}