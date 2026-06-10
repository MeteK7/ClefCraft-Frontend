import { CalendarLayoutItem } from '../models/calendar-layout-item.model';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

export interface DayViewModel {
  date: Date;
  isToday: boolean;
  layoutItems: CalendarLayoutItem<CalendarEventUI>[];
}