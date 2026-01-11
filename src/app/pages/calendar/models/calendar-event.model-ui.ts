export interface CalendarEventUI {
  id?: number;
  subject: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  importance: 'Low' | 'Normal' | 'High';
  comment?: string;
  linkedBoardItemId?: number;
  linkedBoardItemTitle?: string; 
}