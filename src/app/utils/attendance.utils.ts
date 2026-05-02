export function getAttendanceLabel(score?: number | null): string {
  if (score == null) return '';
  if (score > 0.8) return 'Very Likely';
  if (score > 0.6) return 'Likely';
  if (score > 0.4) return 'Uncertain';
  if (score > 0.2) return 'Unlikely';
  return 'Very Unlikely';
}

export function getAttendanceColor(score?: number | null): string {
  if (score == null) return '#999';
  if (score > 0.8) return '#2ecc71';
  if (score > 0.6) return '#27ae60';
  if (score > 0.4) return '#f39c12';
  if (score > 0.2) return '#e67e22';
  return '#e74c3c';
}