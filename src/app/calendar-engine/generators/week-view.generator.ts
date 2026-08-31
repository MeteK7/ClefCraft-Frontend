import { WeekViewModel, WeekDayColumn } from '../models/week-view.model';
import { TimeBlockLayoutEngine } from '../layout/time-block-layout-engine';
import { MonthLayoutEngine } from '../layout/month-layout-engine';
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

    const weekDates: Date[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(current);
      d.setDate(current.getDate() + i);
      return d;
    });

    const columns: WeekDayColumn[] = weekDates.map(columnDate => {
      const dayTimestamp = DateUtils.toDateOnly(columnDate);

      // Timed events only here — all-day events are laid out once for the
      // whole week below, not duplicated per column (see WeekViewModel).
      const timedEvents = events.filter(event => {
        if (event.allDayEvent) return false;
        const start = DateUtils.toDateOnly(new Date(event.startDate));
        const end = DateUtils.toDateOnly(new Date(event.endDate));
        return start <= dayTimestamp && end >= dayTimestamp;
      });

      const normalized = EventNormalizer.normalize(timedEvents);
      const layoutItems = TimeBlockLayoutEngine.generate(normalized);

      return {
        date: columnDate,
        isToday: DateUtils.isSameDate(columnDate, today),
        layoutItems
      };
    });

    const allDayEvents = events.filter(e => e.allDayEvent);
    const allDayLayoutItems = MonthLayoutEngine.generate(allDayEvents, weekDates);

    return {
      viewStartDate: columns[0].date,
      viewEndDate: columns[6].date,
      columns,
      allDayLayoutItems
    };
  }
}
