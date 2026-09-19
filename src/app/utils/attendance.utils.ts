/**
 * Rounds a raw 0-1 attendance score to the whole-percent integer actually shown in the UI.
 * getAttendanceLabel/getAttendanceColor bucket on THIS rounded value (not the raw score) so
 * the displayed percentage and phrase can never disagree — e.g. a raw score of 0.5996 rounds
 * to 60%, and must therefore read "Likely", not "Uncertain (60%)". Every UI site that shows
 * the percentage should call this too, rather than rounding independently.
 */
export function getAttendancePercent(score?: number | null): number | null {
  if (score == null) return null;
  return Math.round(score * 100);
}

export function getAttendanceLabel(score?: number | null): string {
  const pct = getAttendancePercent(score);
  if (pct == null) return '';
  if (pct >= 80) return 'Very Likely';
  if (pct >= 60) return 'Likely';
  if (pct >= 40) return 'Uncertain';
  if (pct >= 20) return 'Unlikely';
  return 'Very Unlikely';
}

export function getAttendanceColor(score?: number | null): string {
  const pct = getAttendancePercent(score);
  if (pct == null) return '#999';
  if (pct >= 80) return '#2ecc71';
  if (pct >= 60) return '#27ae60';
  if (pct >= 40) return '#f39c12';
  if (pct >= 20) return '#e67e22';
  return '#e74c3c';
}
