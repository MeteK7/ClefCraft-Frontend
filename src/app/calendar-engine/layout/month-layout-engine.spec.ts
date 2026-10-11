import { MonthEventInput, MonthLayoutEngine, MonthLayoutItem } from './month-layout-engine';

interface TestEvent extends MonthEventInput {
  id: number;
}

// Monday 2026-05-11 to Sunday 2026-05-17, local time.
const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 4, 11 + i));
const d = (day: number, hour = 0) => new Date(2026, 4, day, hour);

const place = (events: TestEvent[]) =>
  MonthLayoutEngine.generate(events, week).map((item: MonthLayoutItem<TestEvent>) => ({
    id: item.event.id, col: item.columnStart, span: item.columnSpan, lane: item.lane
  }));

describe('MonthLayoutEngine', () => {
  it('places a timed one-day event in its weekday column', () => {
    expect(place([{ id: 1, startDate: d(13, 10), endDate: d(13, 11) }]))
      .toEqual([{ id: 1, col: 3, span: 1, lane: 0 }]);
  });

  it('spans a multi-day timed event across its days', () => {
    expect(place([{ id: 1, startDate: d(12, 9), endDate: d(14, 17) }]))
      .toEqual([{ id: 1, col: 2, span: 3, lane: 0 }]);
  });

  it('treats an all-day event\'s end as exclusive', () => {
    expect(place([{ id: 1, startDate: d(15), endDate: d(17), allDayEvent: true }]))
      .toEqual([{ id: 1, col: 5, span: 2, lane: 0 }]);
  });

  it('clips events that start before or end after the week', () => {
    expect(place([
      { id: 1, startDate: d(9, 10), endDate: d(12, 10) },
      { id: 2, startDate: d(16, 10), endDate: d(19, 10) },
    ])).toEqual([
      { id: 1, col: 1, span: 2, lane: 0 },
      { id: 2, col: 6, span: 2, lane: 0 },
    ]);
  });

  it('leaves out events outside the week', () => {
    expect(place([
      { id: 1, startDate: d(20, 10), endDate: d(20, 11) },
      { id: 2, startDate: d(10), endDate: d(11), allDayEvent: true }, // Sunday before, exclusive end
    ])).toEqual([]);
  });

  it('stacks overlapping events in lanes by start time and reuses free lanes', () => {
    expect(place([
      { id: 2, startDate: d(13, 10), endDate: d(13, 11) },
      { id: 1, startDate: d(12, 9), endDate: d(14, 17) },
      { id: 3, startDate: d(15, 9), endDate: d(15, 10) },
    ])).toEqual([
      { id: 1, col: 2, span: 3, lane: 0 },
      { id: 2, col: 3, span: 1, lane: 1 },
      { id: 3, col: 5, span: 1, lane: 0 },
    ]);
  });

  it('maps a pointer x position to a day column, clamped to the row', () => {
    expect(MonthLayoutEngine.columnIndexFromPointerX(100, 700, 100)).toBe(0);
    expect(MonthLayoutEngine.columnIndexFromPointerX(100, 700, 450)).toBe(3);
    expect(MonthLayoutEngine.columnIndexFromPointerX(100, 700, 900)).toBe(6);
    expect(MonthLayoutEngine.columnIndexFromPointerX(100, 700, 50)).toBe(0);
  });

  it('finds the first free lane in a column, ignoring the event being dragged', () => {
    const items: MonthLayoutItem<TestEvent>[] = [
      { event: { id: 1, startDate: d(12), endDate: d(14) }, columnStart: 2, columnSpan: 3, lane: 0 },
      { event: { id: 2, startDate: d(13), endDate: d(13) }, columnStart: 3, columnSpan: 1, lane: 1 },
    ];

    expect(MonthLayoutEngine.laneForColumn(items, 3, undefined)).toBe(2);
    expect(MonthLayoutEngine.laneForColumn(items, 3, 2)).toBe(1);
    expect(MonthLayoutEngine.laneForColumn(items, 6, undefined)).toBe(0);
  });
});
