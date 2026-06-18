import { Item } from '../models/board-state.model';
import { StatusTransitionMap, isTransitionAllowed } from './status-validation-engine';

export interface TransitionResult {
  success: boolean;
  item: Item;
  error?: string;
}

/**
 * Applies a status change to an item, validating it against the
 * transition map first. Returns a new item object on success
 * (does not mutate the input).
 */
export function applyStatusTransition(
  item: Item,
  nextStatusId: number,
  transitions: StatusTransitionMap
): TransitionResult {
  if (!isTransitionAllowed(item.statusId, nextStatusId, transitions)) {
    return {
      success: false,
      item,
      error: `Transition from status ${item.statusId} to ${nextStatusId} is not allowed.`,
    };
  }

  return {
    success: true,
    item: {
      ...item,
      statusId: nextStatusId,
      status: undefined, // caller should re-resolve display status from lookups
      dateModified: new Date(),
    },
  };
}

/**
 * Applies a column move (e.g. drag between board columns), which may or
 * may not also imply a status change depending on board configuration.
 * `columnStatusMap` maps a board column id to the status id it represents.
 */
export function applyColumnTransition(
  item: Item,
  newColumnId: number,
  columnStatusMap: Record<number, number> | undefined,
  transitions: StatusTransitionMap
): TransitionResult {
  const impliedStatusId = columnStatusMap?.[newColumnId];

  if (impliedStatusId === undefined) {
    // No status implication; just move columns.
    return {
      success: true,
      item: { ...item, boardColumnId: newColumnId, dateModified: new Date() },
    };
  }

  const statusResult = applyStatusTransition(item, impliedStatusId, transitions);
  if (!statusResult.success) {
    return statusResult;
  }

  return {
    success: true,
    item: { ...statusResult.item, boardColumnId: newColumnId },
  };
}
