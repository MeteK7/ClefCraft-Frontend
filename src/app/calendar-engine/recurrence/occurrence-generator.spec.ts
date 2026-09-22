import { OccurrenceGenerator } from './occurrence-generator';

describe('OccurrenceGenerator', () => {
  function makeEvent(overrides: Partial<{
    id: number;
    subject: string;
    recurrenceRule?: string;
    startDate: Date;
    endDate: Date;
  }> = {}) {
    return {
      id: 1,
      subject: 'Event',
      startDate: new Date('2026-01-01T09:00:00'),
      endDate: new Date('2026-01-01T10:00:00'),
      ...overrides,
    };
  }

  it('returns the event unchanged in a single-element array when recurrenceRule is absent', () => {
    const event = makeEvent();
    const result = OccurrenceGenerator.generateOccurrences(
      event,
      new Date('2026-01-01T00:00:00'),
      new Date('2026-01-31T23:59:59')
    );

    expect(result).toEqual([event]);
  });

  it('expands a recurring event into one copy per occurrence date with shifted startDate/endDate', () => {
    const event = makeEvent({ recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=3' });
    const result = OccurrenceGenerator.generateOccurrences(
      event,
      new Date('2026-01-01T00:00:00'),
      new Date('2026-01-31T23:59:59')
    );

    expect(result.length).toBe(3);
    expect(result.map(e => e.startDate.getDate())).toEqual([1, 2, 3]);
  });

  it('preserves the original event duration (endDate - startDate) on every generated occurrence', () => {
    const event = makeEvent({
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=3',
      startDate: new Date('2026-01-01T09:00:00'),
      endDate: new Date('2026-01-01T10:30:00'), // 90-minute event
    });

    const result = OccurrenceGenerator.generateOccurrences(
      event,
      new Date('2026-01-01T00:00:00'),
      new Date('2026-01-31T23:59:59')
    );

    result.forEach(occ => {
      const durationMs = occ.endDate.getTime() - occ.startDate.getTime();
      expect(durationMs).toBe(90 * 60 * 1000);
    });
  });

  it('preserves other event fields via spread on every generated occurrence', () => {
    const event = makeEvent({ id: 42, subject: 'Standup', recurrenceRule: 'FREQ=DAILY;COUNT=2' });
    const result = OccurrenceGenerator.generateOccurrences(
      event,
      new Date('2026-01-01T00:00:00'),
      new Date('2026-01-31T23:59:59')
    );

    result.forEach(occ => {
      expect(occ.id).toBe(42);
      expect(occ.subject).toBe('Standup');
    });
  });
});
