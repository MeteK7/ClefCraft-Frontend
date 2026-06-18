import { Status } from '../models/board-state.model';

/**
 * Describes which status transitions are allowed.
 * Map key = current status id, value = set of allowed next status ids.
 * An empty/missing entry means "no restrictions" (any transition allowed).
 */
export type StatusTransitionMap = Record<number, number[]>;

/**
 * Returns true if moving an item from `currentStatusId` to `nextStatusId`
 * is permitted according to the given transition map.
 * If no rules exist for the current status, the transition is allowed.
 */
export function isTransitionAllowed(
  currentStatusId: number,
  nextStatusId: number,
  transitions: StatusTransitionMap
): boolean {
  if (currentStatusId === nextStatusId) {
    return true;
  }

  const allowed = transitions[currentStatusId];
  if (!allowed || allowed.length === 0) {
    return true;
  }

  return allowed.includes(nextStatusId);
}

/** Returns the statuses an item can move to from its current status */
export function getAvailableNextStatuses(
  currentStatusId: number,
  statuses: Status[],
  transitions: StatusTransitionMap
): Status[] {
  const allowed = transitions[currentStatusId];

  if (!allowed || allowed.length === 0) {
    return statuses.filter(s => s.id !== currentStatusId);
  }

  return statuses.filter(s => allowed.includes(s.id));
}
