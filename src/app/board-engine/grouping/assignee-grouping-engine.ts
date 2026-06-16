import { BoardItemView } from '../models/board-item-view.model';

export interface AssigneeGroup {
  assigneeId: string | undefined;
  fullName: string;
  items: BoardItemView[];
}

const UNASSIGNED_KEY = '__unassigned__';

/** Groups items by assignee, with unassigned items collected under one group. */
export function groupByAssignee(items: BoardItemView[]): AssigneeGroup[] {
  const groups = new Map<string, AssigneeGroup>();

  for (const item of items) {
    const key = item.assigneeId ?? UNASSIGNED_KEY;

    let group = groups.get(key);
    if (!group) {
      group = {
        assigneeId: item.assigneeId,
        fullName: item.assigneeId ? item.fullName : 'Unassigned',
        items: [],
      };
      groups.set(key, group);
    }

    group.items.push(item);
  }

  return Array.from(groups.values());
}
