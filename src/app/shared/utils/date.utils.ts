/** Converts a UTC date string from the API into a local Date for display. */
export function toLocalDate(utcDate: string): Date {
  const date = new Date(utcDate);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
}
