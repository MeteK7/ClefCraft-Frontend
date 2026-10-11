import { EventLaneEngine } from './event-lane-engine';
import { EngineEvent } from '../models/engine-event.model';

function ev(id: number, start: number, end: number): EngineEvent<null> {
  return { id, start, end, isAllDay: false, original: null };
}

const lanes = (events: EngineEvent<null>[]) =>
  EventLaneEngine.assignLanes(events).map(a => ({ id: a.event.id, lane: a.lane, laneCount: a.laneCount }));

describe('EventLaneEngine', () => {
  it('puts overlapping events side by side', () => {
    expect(lanes([ev(1, 0, 10), ev(2, 5, 15)])).toEqual([
      { id: 1, lane: 0, laneCount: 2 },
      { id: 2, lane: 1, laneCount: 2 },
    ]);
  });

  it('reuses a lane once it is free, and gives every event the group\'s final lane count', () => {
    expect(lanes([ev(1, 0, 10), ev(2, 5, 15), ev(3, 10, 20)])).toEqual([
      { id: 1, lane: 0, laneCount: 2 },
      { id: 2, lane: 1, laneCount: 2 },
      { id: 3, lane: 0, laneCount: 2 },
    ]);
  });

  it('counts lanes per collision group', () => {
    expect(lanes([ev(1, 0, 10), ev(2, 5, 15), ev(3, 20, 30)])).toEqual([
      { id: 1, lane: 0, laneCount: 2 },
      { id: 2, lane: 1, laneCount: 2 },
      { id: 3, lane: 0, laneCount: 1 },
    ]);
  });

  it('gives a later, wider overlap more lanes to everyone in the group', () => {
    const result = lanes([ev(1, 0, 60), ev(2, 0, 30), ev(3, 10, 20)]);

    expect(result.map(r => r.lane)).toEqual([0, 1, 2]);
    expect(result.every(r => r.laneCount === 3)).toBeTrue();
  });
});
