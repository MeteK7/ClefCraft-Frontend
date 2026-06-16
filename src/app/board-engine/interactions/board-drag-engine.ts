import { BoardView, getAllColumnDropListIds } from '../models/board-view.model';

/**
 * Returns the list of cdkDropList ids that a column's drop list should be
 * connected to, so items can be dragged between any column on the board.
 * Mirrors the old `allColumnIds` getter on BoardComponent.
 */
export function getConnectedDropListIds(board: BoardView | null): string[] {
  if (!board) {
    return [];
  }
  return getAllColumnDropListIds(board);
}
