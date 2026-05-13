export interface EngineEvent<T = any> {

  id: number;

  start: number;
  end: number;

  isAllDay: boolean;

  original: T;
}