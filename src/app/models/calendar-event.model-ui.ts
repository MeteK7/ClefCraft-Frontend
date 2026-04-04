import { EventType } from './event-type.model';

export interface CalendarEventUI {
  id: number;
  subject: string;
  startDate: Date;
  endDate: Date;
  linkedBoardItemId?: number;
  linkedBoardItemTitle?: string;

  // ✅ new fields from backend
  eventTypeId?: number;
  eventTypeName?: string;
  eventColor?: string;

  allDayEvent?: boolean;

  eventType?: EventType | null;

  location?: string;

  importance: 'Low' | 'Normal' | 'High';
  comment?: string;

  attendanceScore?: number;
}