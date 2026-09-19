import { CalendarLayoutItem } from '../models/calendar-layout-item.model';
import { MonthLayoutItem } from '../layout/month-layout-engine';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

export interface WeekDayColumn {
  date: Date;
  isToday: boolean;
  layoutItems: CalendarLayoutItem<CalendarEventUI>[];
}

export interface WeekViewModel {
  viewStartDate: Date;
  viewEndDate: Date;
  columns: WeekDayColumn[];
  /**
   * All-day events for the week, laid out once across the whole 7-day row
   * (columnStart/columnSpan/lane) rather than duplicated per day column —
   * a multi-day event renders as a single spanning bar instead of a
   * separate pill per day, matching how month view already renders
   * multi-day events. Reuses MonthLayoutEngine since the algorithm is
   * identical (a 7-column week row); "month" in the name is a historical
   * artifact of where it was first extracted from.
   */
  allDayLayoutItems: MonthLayoutItem<CalendarEventUI>[];
}
