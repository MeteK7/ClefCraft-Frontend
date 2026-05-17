export interface CalendarEvent {
  id?: number;
  subject: string;
  location?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  importance: 'Low' | 'Normal' | 'High';
  comment?: string;
  isRecurring?: boolean;
  baseEventId: number;
}