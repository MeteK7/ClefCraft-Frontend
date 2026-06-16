import { BoardItemView } from '../models/board-item-view.model';

export interface BoardFilterCriteria {
  statusIds?: number[];
  priorityIds?: number[];
  assigneeIds?: string[];
  tagIds?: number[];
  /** Inclusive lower bound for dueDate */
  dueDateFrom?: Date;
  /** Inclusive upper bound for dueDate */
  dueDateTo?: Date;
}

/** Filters a list of items by the given criteria. All conditions are ANDed. */
export function filterItems(items: BoardItemView[], criteria: BoardFilterCriteria): BoardItemView[] {
  return items.filter(item => {
    if (criteria.statusIds && !criteria.statusIds.includes(item.statusId)) {
      return false;
    }

    if (criteria.priorityIds && !criteria.priorityIds.includes(item.priorityId)) {
      return false;
    }

    if (criteria.assigneeIds) {
      if (!item.assigneeId || !criteria.assigneeIds.includes(item.assigneeId)) {
        return false;
      }
    }

    if (criteria.tagIds && criteria.tagIds.length > 0) {
      const itemTagIds = item.tags.map(t => t.id);
      const hasMatch = criteria.tagIds.some(id => itemTagIds.includes(id));
      if (!hasMatch) {
        return false;
      }
    }

    if (criteria.dueDateFrom && (!item.dueDate || item.dueDate < criteria.dueDateFrom)) {
      return false;
    }

    if (criteria.dueDateTo && (!item.dueDate || item.dueDate > criteria.dueDateTo)) {
      return false;
    }

    return true;
  });
}
