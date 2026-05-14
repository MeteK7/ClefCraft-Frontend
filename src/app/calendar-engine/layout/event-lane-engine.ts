import { EngineEvent } from '../models/engine-event.model';
import { CollisionEngine } from './collision-engine';

export interface LaneAssignment<T> {
  event: EngineEvent<T>;
  lane: number;
  laneCount: number;
}

/**
 * Assigns horizontal lanes to events within collision groups.
 *
 * Two-pass strategy:
 *  Pass 1 – greedily assign each event to the first available lane.
 *  Pass 2 – once the group is fully processed and the final lane
 *            count is known, annotate every assignment with that count.
 *
 * This fixes the bug where events placed early in a group received a
 * stale (smaller) laneCount because more lanes were created later.
 */
export class EventLaneEngine {

  static assignLanes<T>(
    events: EngineEvent<T>[]
  ): LaneAssignment<T>[] {

    const groups = CollisionEngine.buildGroups(events);
    const assignments: LaneAssignment<T>[] = [];

    for (const group of groups) {

      // Pass 1: greedy lane placement
      const lanes: EngineEvent<T>[][] = [];
      const laneMap = new Map<number, number>(); // event.id → lane index

      for (const event of group) {

        let placedLane = -1;

        for (let i = 0; i < lanes.length; i++) {

          const hasOverlap = lanes[i].some(existing =>
            CollisionEngine.overlaps(existing, event)
          );

          if (!hasOverlap) {
            lanes[i].push(event);
            placedLane = i;
            break;
          }
        }

        if (placedLane === -1) {
          lanes.push([event]);
          placedLane = lanes.length - 1;
        }

        laneMap.set(event.id, placedLane);
      }

      // Pass 2: annotate with final lane count
      const laneCount = lanes.length;

      for (const event of group) {
        assignments.push({
          event,
          lane: laneMap.get(event.id)!,
          laneCount,
        });
      }
    }

    return assignments;
  }
}