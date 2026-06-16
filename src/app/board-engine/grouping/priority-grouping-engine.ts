import { BoardItemView } from '../models/board-item-view.model';

export interface PriorityGroup {
  priorityId: number;
  priorityName: string;
  items: BoardItemView[];
}

const NO_PRIORITY_ID = 0;

/** Groups items by priorityId, with items lacking a priority under "No priority". */
export function groupByPriority(items: BoardItemView[]): PriorityGroup[] {
  const groups = new Map<number, PriorityGroup>();

  for (const item of items) {
    const key = item.priorityId ?? NO_PRIORITY_ID;

    let group = groups.get(key);
    if (!group) {
      group = {
        priorityId: key,
        priorityName: item.priorityName ?? 'No priority',
        items: [],
      };
      groups.set(key, group);
    }

    group.items.push(item);
  }

  return Array.from(groups.values()).sort((a, b) => a.priorityId - b.priorityId);
}
