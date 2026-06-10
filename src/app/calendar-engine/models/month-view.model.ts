export interface MonthDayCell<T> {
  date: Date;
  isCurrentMonth: boolean;
  events: T[];
}

export interface MonthViewModel<T> {
  weeks: MonthDayCell<T>[][];
}