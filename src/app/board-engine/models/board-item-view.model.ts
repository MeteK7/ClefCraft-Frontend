import { Item } from './board-state.model';

/**
 * UI-ready representation of an Item.
 * Wraps the raw persistence model and adds computed display-only fields
 * that were previously derived in BoardItemComponent via getters.
 */
export interface BoardItemView {
  /** Original raw item, kept for persistence/round-tripping */
  raw: Item;

  id: number;
  title: string;
  description: string;

  statusId: number;
  priorityId: number;
  priorityName?: string;

  boardId: number;
  boardColumnId: number;

  tags: { id: number; name: string }[];

  assigneeId?: string;
  fullName: string;
  initials: string;

  dueDate?: Date;
  estimatedTime?: number;
  timeSpent?: number;

  createdByFullName: string;
  modifiedByFullName: string;
}

/**
 * Maps a raw Item into a BoardItemView, computing fullName/initials
 * the same way BoardItemComponent's getters used to.
 */
export function toBoardItemView(item: Item): BoardItemView {
  const first = item.assigneeFirstName ?? '';
  const last = item.assigneeLastName ?? '';
  const fullName = `${first} ${last}`.trim();
  const initials = (first.charAt(0) + last.charAt(0)).toUpperCase();

  return {
    raw: item,
    id: item.id,
    title: item.title,
    description: item.description,
    statusId: item.statusId,
    priorityId: item.priorityId,
    priorityName: item.priority?.name,
    boardId: item.boardId,
    boardColumnId: item.boardColumnId,
    tags: item.tags ?? [],
    assigneeId: item.assigneeId,
    fullName,
    initials,
    dueDate: item.dueDate,
    estimatedTime: item.estimatedTime,
    timeSpent: item.timeSpent,
    createdByFullName: item.createdByFullName,
    modifiedByFullName: item.modifiedByFullName,
  };
}
