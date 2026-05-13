import { EngineEvent } from '../models/engine-event.model';

export class CollisionEngine {

  static buildGroups<T>(
    events: EngineEvent<T>[]
  ): EngineEvent<T>[][] {

    if (!events.length) {
      return [];
    }

    const sorted = [...events]
      .sort((a, b) => a.start - b.start);

    const groups: EngineEvent<T>[][] = [];

    let currentGroup: EngineEvent<T>[] = [];
    let currentEnd = 0;

    for (const event of sorted) {

      if (
        currentGroup.length === 0 ||
        event.start < currentEnd
      ) {

        currentGroup.push(event);

        currentEnd = Math.max(
          currentEnd,
          event.end
        );
      }
      else {

        groups.push(currentGroup);

        currentGroup = [event];

        currentEnd = event.end;
      }
    }

    if (currentGroup.length) {
      groups.push(currentGroup);
    }

    return groups;
  }

  static overlaps<T>(
    a: EngineEvent<T>,
    b: EngineEvent<T>
  ): boolean {

    return a.start < b.end &&
      a.end > b.start;
  }
}