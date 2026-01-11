import { CalendarEvent } from "./calendar-event.model";

export interface SavePayload {
  record: CalendarEvent;
  attachments: File[];
}