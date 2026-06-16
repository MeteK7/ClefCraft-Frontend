import { Item } from '../models/board-state.model';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Cycle time = time from entering "in progress" to reaching "done".
 * Since the raw Item model only tracks dateCreated/dateModified (not a
 * full status-change history), this is approximated using the
 * `inProgressStartedAt` timestamp supplied by the caller (e.g. derived
 * from an activity log) and dateModified as the completion time.
 */
export function getCycleTimeInDays(
  item: Item,
  doneStatusId: number,
  inProgressStartedAt: Date | undefined
): number | null {
  if (item.statusId !== doneStatusId || !item.dateModified || !inProgressStartedAt) {
    return null;
  }

  const diffMs = item.dateModified.getTime() - inProgressStartedAt.getTime();
  return diffMs / MS_PER_DAY;
}

/**
 * Average cycle time (in days) across completed items, given a map of
 * item id -> "in progress" start timestamp.
 */
export function getAverageCycleTime(
  items: Item[],
  doneStatusId: number,
  inProgressStartedAtById: Record<number, Date>
): number | null {
  const cycleTimes = items
    .map(item => getCycleTimeInDays(item, doneStatusId, inProgressStartedAtById[item.id]))
    .filter((v): v is number => v !== null);

  if (cycleTimes.length === 0) {
    return null;
  }

  return cycleTimes.reduce((sum, v) => sum + v, 0) / cycleTimes.length;
}
