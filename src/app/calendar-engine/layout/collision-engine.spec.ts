import { CollisionEngine } from './collision-engine';
import { EngineEvent } from '../models/engine-event.model';

function ev(id: number, start: number, end: number): EngineEvent<null> {
  return { id, start, end, isAllDay: false, original: null };
}

const ids = (groups: EngineEvent<null>[][]) => groups.map(g => g.map(e => e.id));

describe('CollisionEngine', () => {
  it('returns no groups for no events', () => {
    expect(CollisionEngine.buildGroups([])).toEqual([]);
  });

  it('chains overlapping events into one group, in start order', () => {
    expect(ids(CollisionEngine.buildGroups([ev(3, 14, 20), ev(1, 0, 10), ev(2, 5, 15)]))).toEqual([[1, 2, 3]]);
  });

  it('starts a new group when an event begins as the previous ones end', () => {
    expect(ids(CollisionEngine.buildGroups([ev(1, 0, 10), ev(2, 10, 20)]))).toEqual([[1], [2]]);
  });

  it('keeps a long event and the ones inside it together', () => {
    expect(ids(CollisionEngine.buildGroups([ev(1, 0, 100), ev(2, 10, 20), ev(3, 50, 60), ev(4, 100, 110)])))
      .toEqual([[1, 2, 3], [4]]);
  });

  it('overlaps is false for touching edges and true for nesting', () => {
    expect(CollisionEngine.overlaps(ev(1, 0, 10), ev(2, 10, 20))).toBeFalse();
    expect(CollisionEngine.overlaps(ev(1, 0, 100), ev(2, 10, 20))).toBeTrue();
    expect(CollisionEngine.overlaps(ev(1, 0, 11), ev(2, 10, 20))).toBeTrue();
  });
});
