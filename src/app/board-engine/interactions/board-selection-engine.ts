import { BoardItemView } from '../models/board-item-view.model';
import { BoardColumnView } from '../models/board-column-view.model';
import { BoardView } from '../models/board-view.model';
import { BoardViewMode } from '../types/board-view-model.type';

/**
 * Pure selection-state transitions, extracted from BoardComponent.
 * The component still owns the actual mutable state; these helpers
 * compute the *next* state given an event.
 */

export interface SelectionState {
  selectedItem: BoardItemView | null;
  viewMode: BoardViewMode;
  isSidebarOpen: boolean;
}

/**
 * Handles an item click. In 'dialog' mode the caller is expected to open
 * the detail dialog separately; in 'sidebar' mode this marks the sidebar
 * as open (mirrors openItemDetailSidebar's isSidebarOpen flag).
 */
export function selectItem(state: SelectionState, item: BoardItemView): SelectionState {
  const nextState: SelectionState = {
    ...state,
    selectedItem: item,
  };

  if (state.viewMode === 'sidebar') {
    nextState.isSidebarOpen = true;
  }

  return nextState;
}

/**
 * Determines whether a click outside the sidebar should close it,
 * replicating BoardComponent's handleClickOutside logic.
 */
export function shouldCloseSidebarOnOutsideClick(
  state: SelectionState,
  clickedInsideSidebar: boolean
): boolean {
  if (state.viewMode !== 'sidebar' || !state.selectedItem || clickedInsideSidebar) {
    return false;
  }

  // First click after opening just consumes the "open" flag.
  if (state.isSidebarOpen) {
    return false;
  }

  return true;
}

/** Returns the next state after closing the sidebar/deselecting the item */
export function closeSidebar(state: SelectionState): SelectionState {
  return {
    ...state,
    selectedItem: null,
    isSidebarOpen: false,
  };
}

/** Toggles between 'dialog' and 'sidebar' view modes */
export function toggleViewMode(state: SelectionState): SelectionState {
  return {
    ...state,
    viewMode: state.viewMode === 'dialog' ? 'sidebar' : 'dialog',
    isSidebarOpen: false,
  };
}

/**
 * Applies an updated item back into a board view's columns,
 * replicating BoardComponent.onItemUpdated's immutable column update.
 */
export function applyItemUpdate(board: BoardView, updatedItem: BoardItemView): BoardView {
  return {
    ...board,
    columns: board.columns.map((c: BoardColumnView) =>
      c.id === updatedItem.boardColumnId
        ? {
            ...c,
            boardItems: c.boardItems.map(i => (i.id === updatedItem.id ? updatedItem : i)),
          }
        : c
    ),
  };
}

/** Adds a newly created item into its target column */
export function applyItemCreated(board: BoardView, newItem: BoardItemView): BoardView {
  return {
    ...board,
    columns: board.columns.map((c: BoardColumnView) =>
      c.id === newItem.boardColumnId
        ? { ...c, boardItems: [...c.boardItems, newItem] }
        : c
    ),
  };
}
