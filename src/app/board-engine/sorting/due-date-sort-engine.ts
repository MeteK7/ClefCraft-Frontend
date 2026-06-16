import { BoardItemView } from '../models/board-item-view.model';

/**
 * Sorts items by dueDate ascending. Items without a dueDate are placed
 * at the end, regardless of direction.
 */
export function sortByDueDate(items: BoardItemView[], direction: 'asc' | 'desc' = 'asc'): BoardItemView[] {
  const withDate = items.filter(i => !!i.dueDate);
  const withoutDate = items.filter(i => !i.dueDate);

  withDate.sort((a, b) => {
    const diff = a.dueDate!.getTime() - b.dueDate!.getTime();
    return direction === 'asc' ? diff : -diff;
  });

  return [...withDate, ...withoutDate];
}
