import { BoardView } from '../models/board-view.model';
import { BoardColumnView } from '../models/board-column-view.model';
import { BoardItemView } from '../models/board-item-view.model';

/** View mode toggle used by board pages */
export type BoardViewMode = 'dialog' | 'sidebar';

/** Result of a drop operation, normalized for the drop engine */
export interface BoardDropResult {
  /** True if the item moved within the same column (reorder only) */
  sameColumn: boolean;
  item: BoardItemView;
  previousColumnId: number;
  newColumnId: number;
  previousIndex: number;
  currentIndex: number;
}

/** Aggregate shape consumed by board.component.ts */
export interface BoardPageViewModel {
  boardView: BoardView | null;
  selectedItem: BoardItemView | null;
  viewMode: BoardViewMode;
  isSidebarOpen: boolean;
}

export type { BoardView, BoardColumnView, BoardItemView };
