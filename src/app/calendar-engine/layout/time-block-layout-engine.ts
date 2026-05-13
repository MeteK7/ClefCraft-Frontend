import { CalendarLayoutItem }
from '../models/calendar-layout-item.model';

import { EngineEvent }
from '../models/engine-event.model';

import { CollisionEngine }
from './collision-engine';

export class TimeBlockLayoutEngine {

  static readonly HOUR_HEIGHT = 80;

  static generate<T>(
    events: EngineEvent<T>[]
  ): CalendarLayoutItem<T>[] {

    const timedEvents =
      events.filter(e => !e.isAllDay);

    const groups =
      CollisionEngine.buildGroups(
        timedEvents
      );

    const layout: CalendarLayoutItem<T>[] = [];

    for (const group of groups) {

      const lanes: EngineEvent<T>[][] = [];

      for (const event of group) {

        let placedLane = -1;

        for (let laneIndex = 0;
          laneIndex < lanes.length;
          laneIndex++) {

          const lane = lanes[laneIndex];

          const overlaps = lane.some(existing =>
            CollisionEngine.overlaps(
              existing,
              event
            )
          );

          if (!overlaps) {

            lane.push(event);

            placedLane = laneIndex;

            break;
          }
        }

        if (placedLane === -1) {

          lanes.push([event]);

          placedLane = lanes.length - 1;
        }

        const startDate =
          new Date(event.start);

        const endDate =
          new Date(event.end);

        const startMinutes =
          startDate.getHours() * 60 +
          startDate.getMinutes();

        const endMinutes =
          endDate.getHours() * 60 +
          endDate.getMinutes();

        const top =
          (startMinutes / 60) *
          this.HOUR_HEIGHT;

        const height =
          ((endMinutes - startMinutes) / 60) *
          this.HOUR_HEIGHT;

        layout.push({

          event: event.original,

          top,
          height,

          lane: placedLane,
          laneCount: lanes.length,

          left:
            (placedLane / lanes.length) * 100,

          width:
            100 / lanes.length
        });
      }
    }

    return layout;
  }
}