import { EventType } from "./event-type.model";
import { RecurrenceUpdateScope } from "../pages/recurrence-scope-dialog/recurrence-scope-dialog.component";


export interface CalendarEventUI {
  id: number;
  seriesUid: string;
  subject: string;
  startDate: Date;
  endDate: Date;
  allDayEvent?: boolean;

  isRecurring?: boolean;
  
  baseEventId?: number;
  recurrenceRule?: string;
  recurrenceRuleJson?: string | null;
  recurrenceScope?: RecurrenceUpdateScope | null;
  originalOccurrenceDate?: Date | string | null;
  eventTypeId?: number;
  eventTypeName?: string | null;
  eventColor?: string | null;
  eventType?: EventType | null;
  location?: string;
  importance?: 1 | 2 | 3;
  comment?: string;
  attendanceScore?: number | null;
  linkedBoardItemId?: number | null;
  linkedBoardItemTitle?: string;
}