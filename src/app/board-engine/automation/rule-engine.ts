import { Item } from '../models/board-state.model';

export type RuleTriggerType = 'statusChanged' | 'columnChanged' | 'dueDateReached' | 'assigneeChanged';

export interface RuleTrigger {
  type: RuleTriggerType;
  /** For statusChanged/columnChanged: the target status/column id that fires the rule */
  toId?: number;
}

export type RuleActionType = 'setAssignee' | 'setPriority' | 'setStatus' | 'addTag';

export interface RuleAction {
  type: RuleActionType;
  value: string | number;
}

export interface AutomationRule {
  id: number;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  actions: RuleAction[];
}

export interface RuleContext {
  previousItem: Item;
  currentItem: Item;
}

/** Returns true if the rule's trigger matches the given before/after item change. */
export function ruleMatches(rule: AutomationRule, context: RuleContext): boolean {
  if (!rule.enabled) {
    return false;
  }

  const { trigger } = rule;
  const { previousItem, currentItem } = context;

  switch (trigger.type) {
    case 'statusChanged':
      return (
        previousItem.statusId !== currentItem.statusId &&
        (trigger.toId === undefined || currentItem.statusId === trigger.toId)
      );

    case 'columnChanged':
      return (
        previousItem.boardColumnId !== currentItem.boardColumnId &&
        (trigger.toId === undefined || currentItem.boardColumnId === trigger.toId)
      );

    case 'assigneeChanged':
      return previousItem.assigneeId !== currentItem.assigneeId;

    case 'dueDateReached':
      // Evaluated externally on a schedule; not derivable from a single change.
      return false;

    default:
      return false;
  }
}

/** Returns all enabled rules that match the given context. */
export function findMatchingRules(rules: AutomationRule[], context: RuleContext): AutomationRule[] {
  return rules.filter(rule => ruleMatches(rule, context));
}
