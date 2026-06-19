import { EventType } from "./event-type.model";
import { RecurrenceUpdateScope } from "../pages/recurrence-scope-dialog/recurrence-scope-dialog.component";
import { ImportanceLevel } from "./calendar-event.model";

export interface CalendarEventUI {
  id?: number;
  baseEventId?: number;
  seriesUid?: string;
  subject: string;
  startDate: Date;
  endDate: Date;
  allDayEvent?: boolean;
  importance?: ImportanceLevel;
  comment?: string;
  isRecurring?: boolean;
  recurrenceRuleJson?: string | null;
  recurrenceScope?: RecurrenceUpdateScope | null;
  originalOccurrenceDate?: Date | string | null;
  eventTypeId?: number | null;
  eventTypeName?: string | null;
  eventColor?: string | null;
  eventType?: EventType | null;
  location?: string;
  attendanceScore?: number | null;
  linkedBoardItemId?: number | null;
  linkedBoardItemTitle?: string;
  reminderMinutes?: number[];
}