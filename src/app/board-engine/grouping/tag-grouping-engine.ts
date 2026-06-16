import { BoardItemView } from '../models/board-item-view.model';

export interface TagGroup {
  tagId: number;
  tagName: string;
  items: BoardItemView[];
}

const UNTAGGED_ID = 0;

/**
 * Groups items by tag. An item with multiple tags appears in multiple
 * groups. Items with no tags are collected under "Untagged".
 */
export function groupByTag(items: BoardItemView[]): TagGroup[] {
  const groups = new Map<number, TagGroup>();

  for (const item of items) {
    if (!item.tags || item.tags.length === 0) {
      let untagged = groups.get(UNTAGGED_ID);
      if (!untagged) {
        untagged = { tagId: UNTAGGED_ID, tagName: 'Untagged', items: [] };
        groups.set(UNTAGGED_ID, untagged);
      }
      untagged.items.push(item);
      continue;
    }

    for (const tag of item.tags) {
      let group = groups.get(tag.id);
      if (!group) {
        group = { tagId: tag.id, tagName: tag.name, items: [] };
        groups.set(tag.id, group);
      }
      group.items.push(item);
    }
  }

  return Array.from(groups.values());
}
