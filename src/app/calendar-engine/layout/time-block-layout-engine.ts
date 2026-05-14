import { CalendarLayoutItem } from '../models/calendar-layout-item.model';
import { EngineEvent } from '../models/engine-event.model';
import { EventLaneEngine } from './event-lane-engine';
import { TimeBlockEngine } from './time-block-engine';

/**
 * Generates absolute pixel-positioned layout items for timed events
 * within a single day column.
 *
 * Delegates:
 *  - lane assignment to EventLaneEngine (two-pass, correct laneCount)
 *  - time→pixel conversion to TimeBlockEngine
 */
export class TimeBlockLayoutEngine {

  /** Exposed for convenience – matches TimeBlockEngine.HOUR_HEIGHT. */
  static readonly HOUR_HEIGHT = TimeBlockEngine.HOUR_HEIGHT;

  static generate<T>(
    events: EngineEvent<T>[]
  ): CalendarLayoutItem<T>[] {

    const timedEvents = events.filter(e => !e.isAllDay);

    const assignments = EventLaneEngine.assignLanes(timedEvents);

    return assignments.map(({ event, lane, laneCount }) => ({

      event: event.original,

      top:    TimeBlockEngine.topFromTimestamp(event.start),
      height: TimeBlockEngine.heightFromTimestamps(event.start, event.end),

      lane,
      laneCount,

      left:  (lane / laneCount) * 100,
      width: 100 / laneCount,
    }));
  }
}