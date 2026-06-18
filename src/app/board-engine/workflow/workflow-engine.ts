import { Item, Status } from '../models/board-state.model';
import { StatusTransitionMap, getAvailableNextStatuses } from './status-validation-engine';
import { applyColumnTransition, applyStatusTransition, TransitionResult } from './transition-engine';

/**
 * High-level workflow operations combining validation + transition logic.
 * Intended to be called from BoardEngineService / components instead of
 * working with transition-engine and status-validation-engine directly.
 */
export class WorkflowEngine {
  constructor(private transitions: StatusTransitionMap = {}) {}

  /** Move an item to a new status, validating the transition first. */
  moveToStatus(item: Item, nextStatusId: number): TransitionResult {
    return applyStatusTransition(item, nextStatusId, this.transitions);
  }

  /** Move an item to a new board column, applying any implied status change. */
  moveToColumn(
    item: Item,
    newColumnId: number,
    columnStatusMap?: Record<number, number>
  ): TransitionResult {
    return applyColumnTransition(item, newColumnId, columnStatusMap, this.transitions);
  }

  /** List statuses an item is allowed to move to right now. */
  availableStatuses(item: Item, statuses: Status[]): Status[] {
    return getAvailableNextStatuses(item.statusId, statuses, this.transitions);
  }
}
