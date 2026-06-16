import { BoardItemView } from '../models/board-item-view.model';

/**
 * Sorts items by priorityId. By convention lower id = higher priority
 * (e.g. 1 = Highest). Pass an explicit `order` map to override ordering
 * (e.g. when priority ids don't correspond to severity directly).
 */
export function sortByPriority(
  items: BoardItemView[],
  order?: Record<number, number>,
  direction: 'asc' | 'desc' = 'asc'
): BoardItemView[] {
  const rank = (id: number) => (order ? order[id] ?? Number.MAX_SAFE_INTEGER : id);

  return [...items].sort((a, b) => {
    const diff = rank(a.priorityId) - rank(b.priorityId);
    return direction === 'asc' ? diff : -diff;
  });
}
