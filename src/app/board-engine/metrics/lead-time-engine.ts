import { Item } from '../models/board-state.model';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Lead time = time from item creation to completion (dateModified when
 * the item reached `doneStatusId`). Returns null if the item hasn't
 * reached the done status yet, or is missing dateCreated.
 */
export function getLeadTimeInDays(item: Item, doneStatusId: number): number | null {
  if (!item.dateCreated || item.statusId !== doneStatusId || !item.dateModified) {
    return null;
  }

  const diffMs = item.dateModified.getTime() - item.dateCreated.getTime();
  return diffMs / MS_PER_DAY;
}

/** Average lead time (in days) across all completed items. */
export function getAverageLeadTime(items: Item[], doneStatusId: number): number | null {
  const leadTimes = items
    .map(item => getLeadTimeInDays(item, doneStatusId))
    .filter((v): v is number => v !== null);

  if (leadTimes.length === 0) {
    return null;
  }

  return leadTimes.reduce((sum, v) => sum + v, 0) / leadTimes.length;
}
