import { BoardItemView } from '../models/board-item-view.model';

/**
 * Sorts items according to an explicit ordering of item ids
 * (e.g. produced by drag-and-drop reordering and persisted server-side).
 * Items not present in `order` are appended at the end in their
 * original relative order.
 */
export function sortByCustomOrder(items: BoardItemView[], order: number[]): BoardItemView[] {
  const positionMap = new Map<number, number>();
  order.forEach((id, index) => positionMap.set(id, index));

  const known: BoardItemView[] = [];
  const unknown: BoardItemView[] = [];

  for (const item of items) {
    if (positionMap.has(item.id)) {
      known.push(item);
    } else {
      unknown.push(item);
    }
  }

  known.sort((a, b) => positionMap.get(a.id)! - positionMap.get(b.id)!);

  return [...known, ...unknown];
}

/**
 * Given the current order of items in a column after a drag-drop,
 * returns the array of item ids in their new order — ready to persist.
 */
export function extractOrder(items: BoardItemView[]): number[] {
  return items.map(i => i.id);
}
