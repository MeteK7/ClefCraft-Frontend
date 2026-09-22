import { RecurrenceExpander } from './recurrence-expander';
import { RecurrenceRule } from './recurrence-rule-parser';

/**
 * Regression coverage for two bugs found in expand()'s monthly/yearly
 * branches: (1) new Date(y, m, d) doesn't clamp an out-of-range day, so a
 * short month made the rule drift permanently away from its anchor day
 * instead of clamping for just that one month (Jan 31 -> Mar 3 -> Apr 3...
 * instead of Jan 31 -> Feb 28 -> Mar 31); (2) new Date(y, m, d) only takes
 * date components, so every occurrence after the first silently reset to
 * midnight, losing the event's actual start time. Fixed by anchoring every
 * monthly/yearly occurrence back to the original startDate (mirroring the
 * backend's RecurrenceHelper.GenerateSimpleCandidates strategy) instead of
 * compounding off the previous occurrence.
 */
describe('RecurrenceExpander', () => {
  function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
    return {
      frequency: 'daily',
      interval: 1,
      ...overrides,
    };
  }

  describe('daily', () => {
    it('expands within the requested range at the given interval', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-01T09:00:00'),
        rule({ frequency: 'daily', interval: 1 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-03T23:59:59')
      );

      expect(result.map(d => d.getDate())).toEqual([1, 2, 3]);
    });

    it('honors an interval greater than 1', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-01T09:00:00'),
        rule({ frequency: 'daily', interval: 2 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-07T23:59:59')
      );

      expect(result.map(d => d.getDate())).toEqual([1, 3, 5, 7]);
    });
  });

  describe('weekly', () => {
    it('expands within the requested range at the given interval', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-05T09:00:00'), // Monday
        rule({ frequency: 'weekly', interval: 1 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-26T23:59:59')
      );

      expect(result.map(d => d.getDate())).toEqual([5, 12, 19, 26]);
    });

    it('honors an interval greater than 1', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-05T09:00:00'),
        rule({ frequency: 'weekly', interval: 2 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-02-02T23:59:59')
      );

      expect(result.map(d => [d.getMonth(), d.getDate()])).toEqual([
        [0, 5],  // Jan 5
        [0, 19], // Jan 19
        [1, 2],  // Feb 2
      ]);
    });
  });

  describe('monthly', () => {
    it('expands on a day that exists in every month, no clamping needed', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-15T09:00:00'),
        rule({ frequency: 'monthly', interval: 1 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-04-30T23:59:59')
      );

      expect(result.map(d => d.getMonth())).toEqual([0, 1, 2, 3]);
      result.forEach(d => expect(d.getDate()).toBe(15));
    });

    it('honors an interval greater than 1', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-15T09:00:00'),
        rule({ frequency: 'monthly', interval: 3 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-12-31T23:59:59')
      );

      expect(result.map(d => d.getMonth())).toEqual([0, 3, 6, 9]); // Jan, Apr, Jul, Oct
    });
  });

  describe('yearly', () => {
    it('expands on a normal (non-Feb-29) anchor date', () => {
      const result = RecurrenceExpander.expand(
        new Date('2024-06-15T09:00:00'),
        rule({ frequency: 'yearly', interval: 1 }),
        new Date('2024-01-01T00:00:00'),
        new Date('2027-12-31T23:59:59')
      );

      expect(result.map(d => d.getFullYear())).toEqual([2024, 2025, 2026, 2027]);
      result.forEach(d => {
        expect(d.getMonth()).toBe(5);
        expect(d.getDate()).toBe(15);
      });
    });

    it('honors an interval greater than 1', () => {
      const result = RecurrenceExpander.expand(
        new Date('2024-06-15T09:00:00'),
        rule({ frequency: 'yearly', interval: 2 }),
        new Date('2024-01-01T00:00:00'),
        new Date('2030-12-31T23:59:59')
      );

      expect(result.map(d => d.getFullYear())).toEqual([2024, 2026, 2028, 2030]);
    });
  });

  describe('COUNT termination', () => {
    it('stops after exactly count occurrences regardless of range size', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-01T09:00:00'),
        rule({ frequency: 'daily', interval: 1, count: 3 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-12-31T23:59:59')
      );

      expect(result.length).toBe(3);
      expect(result.map(d => d.getDate())).toEqual([1, 2, 3]);
    });
  });

  describe('UNTIL termination', () => {
    it('includes the occurrence exactly on until and nothing past it', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-01T09:00:00'),
        rule({ frequency: 'daily', interval: 1, until: new Date('2026-01-03T09:00:00') }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-01-03T09:00:00') // rangeEnd matches until exactly
      );

      expect(result.map(d => d.getDate())).toEqual([1, 2, 3]);
    });
  });

  describe('range boundaries', () => {
    it('includes an occurrence exactly at rangeStart and rangeEnd (both inclusive)', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-01T09:00:00'),
        rule({ frequency: 'daily', interval: 1 }),
        new Date('2026-01-02T09:00:00'), // exactly the 2nd occurrence
        new Date('2026-01-04T09:00:00')  // exactly the 4th occurrence
      );

      expect(result.map(d => d.getDate())).toEqual([2, 3, 4]);
    });

    it('excludes occurrences just outside either bound', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-01T09:00:00'),
        rule({ frequency: 'daily', interval: 1 }),
        new Date('2026-01-02T09:00:01'), // 1 second after the Jan 2 occurrence
        new Date('2026-01-04T08:59:59')  // 1 second before the Jan 4 occurrence
      );

      expect(result.map(d => d.getDate())).toEqual([3]);
    });
  });

  describe('monthly day-clamping drift regression (Bug 1)', () => {
    it('does not permanently drift after a short month: Jan 31 -> Feb 28 -> Mar 31, not Mar 3', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-31T14:00:00'), // 2026 is not a leap year
        rule({ frequency: 'monthly', interval: 1 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-04-01T00:00:00')
      );

      expect(result.map(d => [d.getMonth(), d.getDate()])).toEqual([
        [0, 31], // Jan 31
        [1, 28], // Feb 28 (clamped)
        [2, 31], // Mar 31 (restored - not compounding off the clamped Feb 28)
      ]);
    });

    it('restores the original day-of-month once a long month recurs (October)', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-31T14:00:00'),
        rule({ frequency: 'monthly', interval: 1, count: 10 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2027-01-01T00:00:00')
      );

      const october = result[9];
      expect(october.getMonth()).toBe(9); // October
      expect(october.getDate()).toBe(31);
    });
  });

  describe('yearly leap-day drift regression (Bug 1)', () => {
    it('clamps Feb 29 to Feb 28 in non-leap years and restores Feb 29 in the next leap year', () => {
      const result = RecurrenceExpander.expand(
        new Date('2024-02-29T14:00:00'), // 2024 is a leap year
        rule({ frequency: 'yearly', interval: 1, count: 5 }),
        new Date('2024-01-01T00:00:00'),
        new Date('2029-01-01T00:00:00')
      );

      expect(result.map(d => [d.getFullYear(), d.getMonth(), d.getDate()])).toEqual([
        [2024, 1, 29], // Feb 29, 2024 (leap)
        [2025, 1, 28], // Feb 28, 2025 (clamped)
        [2026, 1, 28], // Feb 28, 2026 (clamped)
        [2027, 1, 28], // Feb 28, 2027 (clamped)
        [2028, 1, 29], // Feb 29, 2028 (leap - restored)
      ]);
    });
  });

  describe('time-of-day preservation regression (Bug 2)', () => {
    it('preserves hours/minutes/seconds across monthly occurrences', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-15T14:30:45'),
        rule({ frequency: 'monthly', interval: 1, count: 3 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-12-31T23:59:59')
      );

      result.forEach(d => {
        expect(d.getHours()).toBe(14);
        expect(d.getMinutes()).toBe(30);
        expect(d.getSeconds()).toBe(45);
      });
    });

    it('preserves time-of-day across yearly occurrences', () => {
      const result = RecurrenceExpander.expand(
        new Date('2024-06-15T14:30:45'),
        rule({ frequency: 'yearly', interval: 1, count: 3 }),
        new Date('2024-01-01T00:00:00'),
        new Date('2030-12-31T23:59:59')
      );

      result.forEach(d => {
        expect(d.getHours()).toBe(14);
        expect(d.getMinutes()).toBe(30);
        expect(d.getSeconds()).toBe(45);
      });
    });
  });

  describe('interval combined with anchor stepping', () => {
    it('correctly skips months for monthly interval=2 across a short-month boundary', () => {
      const result = RecurrenceExpander.expand(
        new Date('2026-01-31T14:00:00'),
        rule({ frequency: 'monthly', interval: 2, count: 3 }),
        new Date('2026-01-01T00:00:00'),
        new Date('2026-12-31T23:59:59')
      );

      expect(result.map(d => [d.getMonth(), d.getDate()])).toEqual([
        [0, 31], // Jan
        [2, 31], // Mar (skipping Feb)
        [4, 31], // May (skipping Apr)
      ]);
    });
  });
});
