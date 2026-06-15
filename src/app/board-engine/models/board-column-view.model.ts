import { Column } from './board-state.model';
import { BoardItemView, toBoardItemView } from './board-item-view.model';

/**
 * UI-ready representation of a Column.
 * Carries the column metadata plus its items already mapped to view-models.
 */
export interface BoardColumnView {
  id: number;
  title: string;
  /** Used by BoardColumnComponent's cdkDropList id */
  dropListId: string;
  boardItems: BoardItemView[];
}

export function toBoardColumnView(column: Column): BoardColumnView {
  return {
    id: column.id,
    title: column.title,
    dropListId: 'column-' + column.title,
    boardItems: column.boardItems.map(toBoardItemView),
  };
}
