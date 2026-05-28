import { EventType } from "./event-type.model";
import { RecurrenceUpdateScope } from "../pages/recurrence-scope-dialog/recurrence-scope-dialog.component";

/**
 * UI-layer representation of a calendar event.
 *
 * This is the shape that the component works with after the API response
 * has been mapped. The calendar-engine operates on the generic EngineEvent<T>
 * wrapper; CalendarEventUI is the concrete T in those generics.
 */
export interface CalendarEventUI {
  id: number;
  seriesUid: string;
  subject: string;
  startDate: Date;
  endDate: Date;
  allDayEvent?: boolean;

  /** Set when this occurrence belongs to a recurring series. */
  isRecurring?: boolean;
  
  /** The id of the root event for recurring series. */
  baseEventId?: number;
  recurrenceRule?: string;
  recurrenceRuleJson?: string | null;

  /**
   * Selected recurrence edit scope:
   * - this
   * - thisAndFollowing
   * - allPreserve
   * - allOverride
   */
  recurrenceScope?: RecurrenceUpdateScope | null;

  /**
   * Original occurrence date before editing.
   * Needed for recurrence exception targeting.
   */
  originalOccurrenceDate?: Date | string | null;
  eventTypeId?: number;
  eventTypeName?: string | null;
  eventColor?: string | null;
  eventType?: EventType | null;
  location?: string;
  importance?: 1 | 2 | 3;
  comment?: string;
  attendanceScore?: number | null;

  /** Present when the event is linked to a board item. */
  linkedBoardItemId?: number | null;
  linkedBoardItemTitle?: string;
}