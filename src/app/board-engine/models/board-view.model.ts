import { Board } from './board-state.model';
import { BoardColumnView, toBoardColumnView } from './board-column-view.model';

/**
 * Top-level UI-ready representation of a Board: the board metadata
 * plus all of its columns already mapped to view-models.
 */
export interface BoardView {
  id: number;
  title: string;
  columns: BoardColumnView[];
}

export function toBoardView(board: Board): BoardView {
  return {
    id: board.id,
    title: board.title,
    columns: board.boardColumns.map(toBoardColumnView),
  };
}

/** Convenience: all cdkDropList ids for a board, used for cdkDropListConnectedTo */
export function getAllColumnDropListIds(view: BoardView): string[] {
  return view.columns.map(c => c.dropListId);
}
