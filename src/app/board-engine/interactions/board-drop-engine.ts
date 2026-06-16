import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { BoardItemView } from '../models/board-item-view.model';
import { BoardColumnView } from '../models/board-column-view.model';
import { BoardDropResult } from '../types/board-view-model.type';

/**
 * Pure handling of a cdkDropList drop event for board items.
 * Mutates the source/target column item arrays in place (same semantics
 * as moveItemInArray / transferArrayItem) and returns a normalized
 * result describing what happened, so the caller can decide whether to
 * persist a column change via the engine service.
 */
export function handleBoardDrop(
  event: CdkDragDrop<BoardItemView[]>,
  targetColumn: BoardColumnView
): BoardDropResult {
  const sameColumn = event.previousContainer === event.container;

  if (sameColumn) {
    moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
  } else {
    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );
  }

  const item = event.container.data[event.currentIndex];
  const previousColumnId = item.boardColumnId;
  const newColumnId = targetColumn.id;

  if (!sameColumn) {
    // Keep the view-model's column reference in sync immediately
    item.boardColumnId = newColumnId;
    item.raw.boardColumnId = newColumnId;
  }

  return {
    sameColumn,
    item,
    previousColumnId,
    newColumnId,
    previousIndex: event.previousIndex,
    currentIndex: event.currentIndex,
  };
}
