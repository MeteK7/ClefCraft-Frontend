import { WeekViewGenerator } from './week-view.generator';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

/**
 * Regression coverage for the bug reported 2026-08-31: a multi-day all-day
 * event's column separators looked interrupted/misaligned in Week view.
 * Root cause: the generator computed `allDayEvents` independently per day
 * column, so a multi-day event was duplicated as a separate, fully-rounded
 * pill in every column it overlapped instead of one continuous bar — unlike
 * Month view, which already lays multi-day events out as a single spanning
 * item via MonthLayoutEngine. Fixed by reusing that same engine at the
 * week level instead of per-column filtering.
 */
describe('WeekViewGenerator', () => {
  function makeEvent(overrides: Partial<CalendarEventUI> = {}): CalendarEventUI {
    return {
      id: 1,
      subject: 'Event',
      allDayEvent: true,
      startDate: new Date('2026-08-31T00:00:00'),
      endDate: new Date('2026-09-01T00:00:00'),
      ...overrides,
    } as CalendarEventUI;
  }

  // Monday 2026-08-31 is the start of the week under test throughout.
  const weekMonday = new Date('2026-08-31T12:00:00');

  it('lays out a multi-day all-day event as a single spanning item, not one per day column', () => {
    const threeDayTrip = makeEvent({
      subject: 'Trip',
      startDate: new Date('2026-09-01T00:00:00'), // Tuesday
      endDate: new Date('2026-09-04T00:00:00'),   // exclusive -> Tue, Wed, Thu
    });

    const result = WeekViewGenerator.generate(weekMonday, [threeDayTrip]);

    expect(result.allDayLayoutItems.length).toBe(1);
    expect(result.allDayLayoutItems[0].columnStart).toBe(2); // Tuesday = 2nd column
    expect(result.allDayLayoutItems[0].columnSpan).toBe(3);  // Tue, Wed, Thu
  });

  it('does not attach allDayEvents to individual day columns anymore', () => {
    const event = makeEvent();
    const result = WeekViewGenerator.generate(weekMonday, [event]);

    result.columns.forEach(col => {
      expect((col as any).allDayEvents).toBeUndefined();
    });
  });

  it('places two overlapping multi-day all-day events in separate lanes', () => {
    const eventA = makeEvent({
      id: 1, subject: 'A',
      startDate: new Date('2026-08-31T00:00:00'),
      endDate: new Date('2026-09-02T00:00:00'), // Mon-Tue
    });
    const eventB = makeEvent({
      id: 2, subject: 'B',
      startDate: new Date('2026-09-01T00:00:00'),
      endDate: new Date('2026-09-03T00:00:00'), // Tue-Wed, overlaps A on Tuesday
    });

    const result = WeekViewGenerator.generate(weekMonday, [eventA, eventB]);

    expect(result.allDayLayoutItems.length).toBe(2);
    const lanes = result.allDayLayoutItems.map(i => i.lane);
    expect(new Set(lanes).size).toBe(2); // must not share a lane
  });

  it('gives a single-day all-day event a span of exactly 1', () => {
    const oneDayEvent = makeEvent({
      startDate: new Date('2026-08-31T00:00:00'),
      endDate: new Date('2026-09-01T00:00:00'),
    });

    const result = WeekViewGenerator.generate(weekMonday, [oneDayEvent]);

    expect(result.allDayLayoutItems.length).toBe(1);
    expect(result.allDayLayoutItems[0].columnStart).toBe(1);
    expect(result.allDayLayoutItems[0].columnSpan).toBe(1);
  });

  it('still filters timed events per column independently of all-day layout', () => {
    const timedEvent = makeEvent({
      subject: 'Standup',
      allDayEvent: false,
      startDate: new Date('2026-09-02T09:00:00'), // Wednesday
      endDate: new Date('2026-09-02T09:30:00'),
    });

    const result = WeekViewGenerator.generate(weekMonday, [timedEvent]);

    const wednesday = result.columns[2];
    expect(wednesday.layoutItems.length).toBe(1);
    expect(wednesday.layoutItems[0].event.subject).toBe('Standup');
    result.columns.filter((_, i) => i !== 2).forEach(col => {
      expect(col.layoutItems.length).toBe(0);
    });
    expect(result.allDayLayoutItems.length).toBe(0);
  });
});
