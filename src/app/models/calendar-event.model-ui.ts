import { EventType } from "./event-type.model";
import { RecurrenceUpdateScope } from "./recurrence-update-scope.model";
import { ImportanceLevel } from "./calendar-event.model";

export interface CalendarEventUI {
  id?: number;
  baseEventId?: number;
  seriesUid?: string;
  /**
   * Unique per occurrence (e.g. "<seriesUid>_20260905060000"), unlike `id`
   * which is shared by every occurrence of the same recurring series (the
   * backend always projects Id = BaseEventId = the root event's id). Use
   * this, not `id`, whenever identifying one specific occurrence among
   * possibly-several loaded from the same series.
   */
  occurrenceKey?: string;
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