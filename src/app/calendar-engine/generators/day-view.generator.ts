import { DayViewModel } from '../models/day-view.model';
import { TimeBlockLayoutEngine } from '../layout/time-block-layout-engine';
import { EventNormalizer } from '../utils/event-normalizer';
import { DateUtils } from '../utils/date.utils';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

export class DayViewGenerator {
  static generate(selectedDate: Date, events: CalendarEventUI[]): DayViewModel {
    const today = new Date();
    const dayTimestamp = DateUtils.toDateOnly(selectedDate);

    // Target subset slice filtering
    const dayEvents = events.filter(event => {
      const start = DateUtils.toDateOnly(new Date(event.startDate));
      const end = DateUtils.toDateOnly(new Date(event.endDate));
      return start <= dayTimestamp && end >= dayTimestamp;
    });

    const normalized = EventNormalizer.normalize(dayEvents);
    const layoutItems = TimeBlockLayoutEngine.generate(normalized);

    return {
      date: new Date(selectedDate),
      isToday: DateUtils.isSameDate(selectedDate, today),
      layoutItems
    };
  }
}