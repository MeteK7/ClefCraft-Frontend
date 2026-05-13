import { EngineEvent } from '../models/engine-event.model';

export class EventNormalizer {

  static normalize<T extends {
    id: number;
    startDate: Date;
    endDate: Date;
    allDayEvent?: boolean;
  }>(events: T[]): EngineEvent<T>[] {

    return events.map(event => ({
      id: event.id,

      start: new Date(event.startDate).getTime(),
      end: new Date(event.endDate).getTime(),

      isAllDay: !!event.allDayEvent,

      original: event
    }));
  }
}