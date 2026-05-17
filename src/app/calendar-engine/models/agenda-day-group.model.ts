import { CalendarEventUI } from './calendar-event.model-ui';

export interface AgendaDayGroup {
  date: Date;
  events: CalendarEventUI[];
}