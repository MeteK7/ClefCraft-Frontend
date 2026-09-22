import { RecurrenceExceptionEngine, RecurrenceException } from './recurrence-exception-engine';

describe('RecurrenceExceptionEngine', () => {
  function makeOccurrence(overrides: Partial<{
    id: number;
    startDate: Date;
    endDate: Date;
    subject: string;
  }> = {}) {
    return {
      id: 1,
      subject: 'Event',
      startDate: new Date('2026-01-01T09:00:00'),
      endDate: new Date('2026-01-01T10:00:00'),
      ...overrides,
    };
  }

  function makeException(overrides: Partial<RecurrenceException> = {}): RecurrenceException {
    return {
      baseEventId: 1,
      originalDate: new Date('2026-01-01T09:00:00'),
      type: 'deleted',
      ...overrides,
    };
  }

  describe('applyExceptions', () => {
    it('returns occurrences unchanged when there are no exceptions', () => {
      const occurrences = [makeOccurrence()];
      const result = RecurrenceExceptionEngine.applyExceptions(occurrences, []);

      expect(result).toBe(occurrences);
    });

    it('removes an occurrence matching a deleted exception on the same calendar day', () => {
      const occurrences = [
        makeOccurrence({ id: 1, startDate: new Date('2026-01-01T09:00:00') }),
        makeOccurrence({ id: 2, startDate: new Date('2026-01-02T09:00:00') }),
      ];
      const exceptions = [makeException({ type: 'deleted', originalDate: new Date('2026-01-01T00:00:00') })];

      const result = RecurrenceExceptionEngine.applyExceptions(occurrences, exceptions);

      expect(result.map(o => o.id)).toEqual([2]);
    });

    it('patches fields on an occurrence matching a modified exception via override merge', () => {
      const occurrences = [makeOccurrence({ id: 1, subject: 'Original' })];
      const exceptions = [makeException({
        type: 'modified',
        originalDate: new Date('2026-01-01T00:00:00'),
        override: { subject: 'Updated subject' },
      })];

      const result = RecurrenceExceptionEngine.applyExceptions(occurrences, exceptions);

      expect(result[0].subject).toBe('Updated subject');
    });

    it('applies multiple exceptions together (one deleted + one modified) in a single pass', () => {
      const occurrences = [
        makeOccurrence({ id: 1, startDate: new Date('2026-01-01T09:00:00') }),
        makeOccurrence({ id: 2, startDate: new Date('2026-01-02T09:00:00'), subject: 'Original' }),
        makeOccurrence({ id: 3, startDate: new Date('2026-01-03T09:00:00') }),
      ];
      const exceptions = [
        makeException({ type: 'deleted', originalDate: new Date('2026-01-01T00:00:00') }),
        makeException({
          type: 'modified',
          originalDate: new Date('2026-01-02T00:00:00'),
          override: { subject: 'Patched' },
        }),
      ];

      const result = RecurrenceExceptionEngine.applyExceptions(occurrences, exceptions);

      expect(result.map(o => o.id)).toEqual([2, 3]);
      expect(result[0].subject).toBe('Patched');
    });

    it('leaves an occurrence untouched when no exception matches its date', () => {
      const occurrences = [makeOccurrence({ id: 1, subject: 'Original' })];
      const exceptions = [makeException({
        type: 'modified',
        originalDate: new Date('2026-05-01T00:00:00'),
        override: { subject: 'Should not apply' },
      })];

      const result = RecurrenceExceptionEngine.applyExceptions(occurrences, exceptions);

      expect(result[0].subject).toBe('Original');
    });
  });

  describe('applyForBaseEvent', () => {
    it('ignores exceptions belonging to a different baseEventId', () => {
      const occurrences = [makeOccurrence({ id: 1, startDate: new Date('2026-01-01T09:00:00') })];
      const exceptions = [makeException({
        baseEventId: 999,
        type: 'deleted',
        originalDate: new Date('2026-01-01T00:00:00'),
      })];

      const result = RecurrenceExceptionEngine.applyForBaseEvent(occurrences, 1, exceptions);

      expect(result).toEqual(occurrences);
    });

    it('filters to the matching baseEventId then delegates to applyExceptions', () => {
      const occurrences = [
        makeOccurrence({ id: 1, startDate: new Date('2026-01-01T09:00:00') }),
        makeOccurrence({ id: 2, startDate: new Date('2026-01-02T09:00:00') }),
      ];
      const exceptions = [
        makeException({ baseEventId: 1, type: 'deleted', originalDate: new Date('2026-01-01T00:00:00') }),
        makeException({ baseEventId: 999, type: 'deleted', originalDate: new Date('2026-01-02T00:00:00') }),
      ];

      const result = RecurrenceExceptionEngine.applyForBaseEvent(occurrences, 1, exceptions);

      expect(result.map(o => o.id)).toEqual([2]);
    });
  });
});
