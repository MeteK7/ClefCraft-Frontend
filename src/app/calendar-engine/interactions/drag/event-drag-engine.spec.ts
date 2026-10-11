import { EventDragEngine } from './event-drag-engine';
import { TimeBlockEngine } from '../../layout/time-block-engine';

describe('EventDragEngine', () => {
  const quarterHourPx = TimeBlockEngine.HOUR_HEIGHT / 4;

  it('turns a vertical drag distance into minutes snapped to 15', () => {
    expect(EventDragEngine.calculateMinuteDelta(quarterHourPx)).toBe(15);
    expect(EventDragEngine.calculateMinuteDelta(quarterHourPx * 1.2)).toBe(15);
    expect(EventDragEngine.calculateMinuteDelta(-quarterHourPx * 2)).toBe(-30);
    expect(EventDragEngine.calculateMinuteDelta(quarterHourPx * 0.4)).toBe(0);
  });

  it('moves start and end together, keeping the duration and the inputs', () => {
    const start = new Date(2026, 4, 13, 9, 0);
    const end = new Date(2026, 4, 13, 10, 30);

    const moved = EventDragEngine.moveDates(start, end, 45);

    expect(moved).toEqual({ start: new Date(2026, 4, 13, 9, 45), end: new Date(2026, 4, 13, 11, 15) });
    expect(start).toEqual(new Date(2026, 4, 13, 9, 0));
    expect(end).toEqual(new Date(2026, 4, 13, 10, 30));
  });

  it('can move an event across midnight', () => {
    const moved = EventDragEngine.moveDates(new Date(2026, 4, 13, 23, 0), new Date(2026, 4, 13, 23, 30), 60);

    expect(moved).toEqual({ start: new Date(2026, 4, 14, 0, 0), end: new Date(2026, 4, 14, 0, 30) });
  });
});
