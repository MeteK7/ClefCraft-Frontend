export type ImportanceLevel = 0 | 1 | 2; // 0 = Low, 1 = Normal, 2 = High

export interface CalendarEvent {
  id?: number;
  baseEventId?: number;
  seriesUid?: string;
  subject: string;
  location?: string;
  startDate: string;
  endDate: string;
  allDayEvent: boolean;
  importance: ImportanceLevel;
  comment?: string;
  isRecurring?: boolean;
  recurrenceRuleJson?: string | null;
  linkedBoardItemId?: number | null;
  reminderMinutes?: number[];
}