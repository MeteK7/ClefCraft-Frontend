import { Item } from '../models/board-state.model';
import { AutomationRule, RuleAction, RuleContext, findMatchingRules } from './rule-engine';

export interface AutomationResult {
  /** The item after all matched rule actions have been applied */
  item: Item;
  /** Rules that were triggered, in application order */
  appliedRules: AutomationRule[];
}

/**
 * Runs all enabled automation rules against an item change and returns
 * the resulting item with rule actions applied. Does not call the API;
 * the caller is responsible for persisting the returned item via
 * BoardEngineService.updateBoardItem / switchBoardItemColumn.
 */
export function runAutomations(rules: AutomationRule[], context: RuleContext): AutomationResult {
  const matched = findMatchingRules(rules, context);

  let item = { ...context.currentItem };

  for (const rule of matched) {
    for (const action of rule.actions) {
      item = applyAction(item, action);
    }
  }

  return { item, appliedRules: matched };
}

function applyAction(item: Item, action: RuleAction): Item {
  switch (action.type) {
    case 'setAssignee':
      return { ...item, assigneeId: String(action.value) };

    case 'setPriority':
      return { ...item, priorityId: Number(action.value), priority: undefined };

    case 'setStatus':
      return { ...item, statusId: Number(action.value), status: undefined };

    case 'addTag': {
      const tagId = Number(action.value);
      const existingTags = item.tags ?? [];
      if (existingTags.some(t => t.id === tagId)) {
        return item;
      }
      // Name is unresolved here; caller can re-hydrate from a tag lookup.
      return { ...item, tags: [...existingTags, { id: tagId, name: '' }] };
    }

    default:
      return item;
  }
}
