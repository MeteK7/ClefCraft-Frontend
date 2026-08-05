export interface CreateSession {
  columnDate: Date;

  container: HTMLElement;
  startMouseY: number;

  startMinutes: number;
  endMinutes: number;

  dragged: boolean;
}