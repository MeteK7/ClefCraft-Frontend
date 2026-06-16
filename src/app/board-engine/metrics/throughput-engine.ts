import { Item } from '../models/board-state.model';

export type ThroughputPeriod = 'day' | 'week' | 'month';

export interface ThroughputBucket {
  /** ISO date string identifying the bucket start */
  periodStart: string;
  count: number;
}

/**
 * Counts how many items reached `doneStatusId`, bucketed by completion
 * date (dateModified) into the given period.
 */
export function getThroughput(
  items: Item[],
  doneStatusId: number,
  period: ThroughputPeriod = 'week'
): ThroughputBucket[] {
  const completed = items.filter(i => i.statusId === doneStatusId && i.dateModified);

  const buckets = new Map<string, number>();

  for (const item of completed) {
    const key = bucketKey(item.dateModified!, period);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .map(([periodStart, count]) => ({ periodStart, count }))
    .sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1));
}

function bucketKey(date: Date, period: ThroughputPeriod): string {
  const d = new Date(date);

  switch (period) {
    case 'day':
      return d.toISOString().slice(0, 10); // YYYY-MM-DD

    case 'week': {
      // ISO week start (Monday)
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() - day + 1);
      return d.toISOString().slice(0, 10);
    }

    case 'month':
      return d.toISOString().slice(0, 7); // YYYY-MM

    default:
      return d.toISOString().slice(0, 10);
  }
}
