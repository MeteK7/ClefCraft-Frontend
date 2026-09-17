import { getAttendanceColor, getAttendanceLabel, getAttendancePercent } from './attendance.utils';

describe('attendance.utils', () => {
  describe('getAttendancePercent', () => {
    it('rounds a raw 0-1 score to the nearest whole percent', () => {
      expect(getAttendancePercent(0.734)).toBe(73);
      expect(getAttendancePercent(0.5996)).toBe(60);
    });

    it('returns null for null/undefined scores', () => {
      expect(getAttendancePercent(null)).toBeNull();
      expect(getAttendancePercent(undefined)).toBeNull();
    });
  });

  describe('getAttendanceLabel / getAttendanceColor — null handling', () => {
    it('returns an empty label and neutral color for null/undefined', () => {
      expect(getAttendanceLabel(null)).toBe('');
      expect(getAttendanceLabel(undefined)).toBe('');
      expect(getAttendanceColor(null)).toBe('#999');
      expect(getAttendanceColor(undefined)).toBe('#999');
    });
  });

  describe('getAttendanceLabel — representative values', () => {
    it('buckets a clearly-high score as Very Likely', () => {
      expect(getAttendanceLabel(0.95)).toBe('Very Likely');
    });

    it('buckets a clearly-mid-high score as Likely', () => {
      expect(getAttendanceLabel(0.7)).toBe('Likely');
    });

    it('buckets a clearly-mid score as Uncertain', () => {
      expect(getAttendanceLabel(0.5)).toBe('Uncertain');
    });

    it('buckets a clearly-mid-low score as Unlikely', () => {
      expect(getAttendanceLabel(0.3)).toBe('Unlikely');
    });

    it('buckets a clearly-low score as Very Unlikely', () => {
      expect(getAttendanceLabel(0.05)).toBe('Very Unlikely');
    });
  });

  describe('getAttendanceLabel — boundary values (rounded-percent basis)', () => {
    // Each threshold (20/40/60/80) is inclusive on the upper tier once rounded — the
    // displayed percentage and the phrase are derived from the SAME rounded integer, so
    // they can never disagree (regression coverage for the "Uncertain (60%)" class of bug).
    const cases: Array<[number, string, string]> = [
      [0.0, '0%', 'Very Unlikely'],
      [0.01, '1%', 'Very Unlikely'],
      [0.20, '20% exactly', 'Unlikely'],
      [0.201, '20.1%', 'Unlikely'],
      [0.194, 'rounds to 19%, just under 20', 'Very Unlikely'],
      [0.40, '40% exactly', 'Uncertain'],
      [0.401, '40.1%', 'Uncertain'],
      [0.394, 'rounds to 39%, just under 40', 'Unlikely'],
      [0.60, '60% exactly', 'Likely'],
      [0.601, '60.1%', 'Likely'],
      [0.594, 'rounds to 59%, just under 60', 'Uncertain'],
      [0.80, '80% exactly', 'Very Likely'],
      [0.801, '80.1%', 'Very Likely'],
      [0.794, 'rounds to 79%, just under 80', 'Likely'],
      [1.0, '100%', 'Very Likely'],
    ];

    for (const [score, description, expected] of cases) {
      it(`labels a raw score of ${score} (${description}) as "${expected}"`, () => {
        expect(getAttendanceLabel(score)).toBe(expected);
      });
    }
  });

  describe('regression: displayed percentage and phrase must never contradict each other', () => {
    it('a raw score that rounds up to a threshold displays the upper tier\'s phrase, not the lower one', () => {
      // 0.5996 -> rounds to 60% for display. Before the fix, the raw-score comparison
      // (0.5996 > 0.6 === false) produced "Uncertain (60%)" — a display/phrase contradiction,
      // since 60% unambiguously belongs to the "Likely" tier once rounded.
      const score = 0.5996;
      expect(getAttendancePercent(score)).toBe(60);
      expect(getAttendanceLabel(score)).toBe('Likely');
    });

    it('the same case at each of the other three thresholds', () => {
      expect(getAttendanceLabel(0.1996)).toBe('Unlikely'); // rounds to 20%
      expect(getAttendanceLabel(0.3996)).toBe('Uncertain'); // rounds to 40%
      expect(getAttendanceLabel(0.7996)).toBe('Very Likely'); // rounds to 80%
    });
  });

  describe('getAttendanceColor — stays synchronized with getAttendanceLabel at every boundary', () => {
    const scoresToCheck = [0.0, 0.01, 0.20, 0.399, 0.40, 0.599, 0.60, 0.799, 0.80, 1.0, 0.5996];
    const colorByLabel: Record<string, string> = {
      'Very Likely': '#2ecc71',
      'Likely': '#27ae60',
      'Uncertain': '#f39c12',
      'Unlikely': '#e67e22',
      'Very Unlikely': '#e74c3c',
    };

    for (const score of scoresToCheck) {
      it(`color matches the label's tier for score ${score}`, () => {
        const label = getAttendanceLabel(score);
        expect(getAttendanceColor(score)).toBe(colorByLabel[label]);
      });
    }
  });
});
