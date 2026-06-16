import { BoardItemView } from '../models/board-item-view.model';

/**
 * Case-insensitive text search across an item's title, description,
 * assignee name, and tag names.
 */
export function searchItems(items: BoardItemView[], query: string): BoardItemView[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return items;
  }

  return items.filter(item => {
    if (item.title.toLowerCase().includes(normalized)) {
      return true;
    }
    if (item.description?.toLowerCase().includes(normalized)) {
      return true;
    }
    if (item.fullName.toLowerCase().includes(normalized)) {
      return true;
    }
    return item.tags.some(tag => tag.name.toLowerCase().includes(normalized));
  });
}
