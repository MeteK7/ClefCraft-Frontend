import { RecurrenceRuleParser } from './recurrence-rule-parser';

describe('RecurrenceRuleParser', () => {
  describe('FREQ', () => {
    it('parses DAILY', () => {
      expect(RecurrenceRuleParser.parse('FREQ=DAILY').frequency).toBe('daily');
    });

    it('parses WEEKLY', () => {
      expect(RecurrenceRuleParser.parse('FREQ=WEEKLY').frequency).toBe('weekly');
    });

    it('parses MONTHLY', () => {
      expect(RecurrenceRuleParser.parse('FREQ=MONTHLY').frequency).toBe('monthly');
    });

    it('parses YEARLY', () => {
      expect(RecurrenceRuleParser.parse('FREQ=YEARLY').frequency).toBe('yearly');
    });
  });

  describe('INTERVAL', () => {
    it('defaults to 1 when omitted', () => {
      expect(RecurrenceRuleParser.parse('FREQ=DAILY').interval).toBe(1);
    });

    it('parses an explicit value', () => {
      expect(RecurrenceRuleParser.parse('FREQ=DAILY;INTERVAL=3').interval).toBe(3);
    });
  });

  describe('COUNT', () => {
    it('is undefined when omitted', () => {
      expect(RecurrenceRuleParser.parse('FREQ=DAILY').count).toBeUndefined();
    });

    it('parses an explicit value', () => {
      expect(RecurrenceRuleParser.parse('FREQ=DAILY;COUNT=5').count).toBe(5);
    });
  });

  describe('UNTIL', () => {
    it('is undefined when omitted', () => {
      expect(RecurrenceRuleParser.parse('FREQ=DAILY').until).toBeUndefined();
    });

    it('parses an explicit value into a Date', () => {
      const result = RecurrenceRuleParser.parse('FREQ=DAILY;UNTIL=2026-06-15T00:00:00.000Z');
      expect(result.until).toEqual(new Date('2026-06-15T00:00:00.000Z'));
    });
  });

  describe('BYDAY', () => {
    it('parses a single day into its weekday index', () => {
      expect(RecurrenceRuleParser.parse('FREQ=WEEKLY;BYDAY=TU').byWeekDays).toEqual([2]);
    });

    it('parses multiple comma-separated days into an array of indices, in order', () => {
      expect(RecurrenceRuleParser.parse('FREQ=WEEKLY;BYDAY=MO,WE,FR').byWeekDays).toEqual([1, 3, 5]);
    });

    it('is undefined when omitted', () => {
      expect(RecurrenceRuleParser.parse('FREQ=DAILY').byWeekDays).toBeUndefined();
    });
  });

  /**
   * Known, accepted gap (mirrors the same gap on the backend): BYDAY only
   * matches plain 2-letter weekday codes. A numeric-prefixed value like
   * "2TU" (2nd Tuesday of the month, needed for MONTHLY-by-weekday rules)
   * isn't recognized and resolves to -1. Documenting current behavior here,
   * not fixing it - expanding BYDAY parsing is a feature gap, not a bug.
   */
  describe('BYDAY numeric-prefix gap (known limitation, not fixed here)', () => {
    it('returns -1 for a numeric-prefixed BYDAY value like "2TU"', () => {
      expect(RecurrenceRuleParser.parse('FREQ=MONTHLY;BYDAY=2TU').byWeekDays).toEqual([-1]);
    });
  });

  it('parses a full multi-key rule string combining FREQ/INTERVAL/COUNT/BYDAY together', () => {
    const result = RecurrenceRuleParser.parse('FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,FR');

    expect(result).toEqual({
      frequency: 'weekly',
      interval: 2,
      count: 10,
      until: undefined,
      byWeekDays: [1, 5],
    });
  });
});
