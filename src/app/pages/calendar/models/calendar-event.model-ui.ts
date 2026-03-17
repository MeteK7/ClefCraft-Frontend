import { EventType } from '../../../models/event-type.model';

export interface CalendarEventUI {
  id?: number;
  subject: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  allDayEvent: boolean;
  importance: 'Low' | 'Normal' | 'High';
  comment?: string;
  linkedBoardItemId?: number;
  linkedBoardItemTitle?: string;
  eventTypeId?: number | null;
  eventTypeName?: string | null;
  eventColor?: string | null;
}