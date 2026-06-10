import { AgendaDayGroup } from '../../models/agenda-day-group.model';
import { DateUtils } from '../utils/date.utils';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

export class AgendaViewGenerator {
  private static readonly DEFAULT_AGENDA_SPAN_DAYS = 30;

  static generate(selectedDate: Date, events: CalendarEventUI[]): AgendaDayGroup[] {
    const agendaGroups: AgendaDayGroup[] = [];
    const runningAnchorDate = new Date(selectedDate);
    runningAnchorDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < this.DEFAULT_AGENDA_SPAN_DAYS; i++) {
      const currentGroupDate = new Date(runningAnchorDate);
      currentGroupDate.setDate(runningAnchorDate.getDate() + i);

      const targetDayTimestamp = DateUtils.toDateOnly(currentGroupDate);

      // Extract intersect mapping configuration matches
      const dayEvents = events.filter(event => {
        const start = DateUtils.toDateOnly(new Date(event.startDate));
        const end = DateUtils.toDateOnly(new Date(event.endDate));
        return start <= targetDayTimestamp && end >= targetDayTimestamp;
      });

      if (dayEvents.length > 0) {
        // Enforce predictive rendering sort indexing: All Day configurations up top, timed chronologically next
        const sortedEvents = [...dayEvents].sort((a, b) => {
          if (a.allDayEvent && !b.allDayEvent) return -1;
          if (!a.allDayEvent && b.allDayEvent) return 1;
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });

        agendaGroups.push({
          date: currentGroupDate,
          events: sortedEvents
        });
      }
    }

    return agendaGroups;
  }
}