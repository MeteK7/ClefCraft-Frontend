import { WeekViewModel, WeekDayColumn } from '../models/week-view.model';
import { TimeBlockLayoutEngine } from '../layout/time-block-layout-engine';
import { EventNormalizer } from '../utils/event-normalizer';
import { DateUtils } from '../utils/date.utils';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

export class WeekViewGenerator {
  static generate(selectedDate: Date, events: CalendarEventUI[]): WeekViewModel {
    const today = new Date();
    const current = new Date(selectedDate);
    const ISOOffsetDay = (current.getDay() + 6) % 7;
    
    current.setDate(current.getDate() - ISOOffsetDay);
    current.setHours(0, 0, 0, 0);

    const columns: WeekDayColumn[] = Array.from({ length: 7 }, (_, i) => {
      const columnDate = new Date(current);
      columnDate.setDate(current.getDate() + i);

      // Filter events down to this column day spectrum boundary exclusively
      const dayTimestamp = DateUtils.toDateOnly(columnDate);
      const dayEvents = events.filter(event => {
        const start = DateUtils.toDateOnly(new Date(event.startDate));
        const end = DateUtils.toDateOnly(new Date(event.endDate));
        return start <= dayTimestamp && end >= dayTimestamp;
      });

      const normalized = EventNormalizer.normalize(dayEvents);
      const layoutItems = TimeBlockLayoutEngine.generate(normalized);

      return {
        date: columnDate,
        isToday: DateUtils.isSameDate(columnDate, today),
        layoutItems
      };
    });

    return {
      viewStartDate: columns[0].date,
      viewEndDate: columns[6].date,
      columns
    };
  }
}