import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardColumnComponent } from '../board-column/board-column.component';
import { BoardEngineService } from '../../board-engine/services/board-engine.service';
import { BoardView, toBoardView } from '../../board-engine/models/board-view.model';
import { BoardItemView } from '../../board-engine/models/board-item-view.model';
import { Board, Item } from '../../board-engine/models/board-state.model';
import {
  applyItemCreated,
  applyItemUpdate,
  closeSidebar as closeSidebarState,
  selectItem,
  shouldCloseSidebarOnOutsideClick,
  SelectionState,
  toggleViewMode as toggleViewModeState,
} from '../../board-engine/interactions/board-selection-engine';
import { getConnectedDropListIds } from '../../board-engine/interactions/board-drag-engine';
import { AddItemFormComponent } from '../../components/add-item-form/add-item-form.component';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { ItemDetailDialogComponent } from '../item-detail-dialog/item-detail-dialog.component';
import { ItemDetailSidebarComponent } from '../item-detail-sidebar/item-detail-sidebar.component';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BoardColumnComponent,
    DragDropModule,
    AddItemFormComponent,
    ItemDetailSidebarComponent,
    MatIconModule,
  ],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.css'],
})
export class BoardComponent implements OnInit {
  boards: Board[] = [];
  boardView: BoardView | null = null;
  selectedBoardId: number | null = null;

  selection: SelectionState = {
    selectedItem: null,
    viewMode: 'dialog',
    isSidebarOpen: false,
  };

  constructor(
    private boardEngine: BoardEngineService,
    private dialog: MatDialog,
    private eRef: ElementRef
  ) { }

  ngOnInit(): void {
    this.loadBoards();
  }

  // ---------------------------------------------------------------------
  // Getters delegating to selection state (keeps template bindings simple)
  // ---------------------------------------------------------------------

  get selectedItem(): BoardItemView | null {
    return this.selection.selectedItem;
  }

  get viewMode(): 'dialog' | 'sidebar' {
    return this.selection.viewMode;
  }

  set viewMode(mode: 'dialog' | 'sidebar') {
    this.selection = { ...this.selection, viewMode: mode, isSidebarOpen: false };
  }

  get columns() {
    return this.boardView?.columns ?? [];
  }

  get allColumnIds(): string[] {
    return getConnectedDropListIds(this.boardView);
  }

  // ---------------------------------------------------------------------
  // Outside-click handling for the sidebar
  // ---------------------------------------------------------------------

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event): void {
    const target = event.target as HTMLElement;
    const sidebar = document.querySelector('.sidebar');
    const clickedInsideSidebar = !!sidebar && sidebar.contains(target);

    if (shouldCloseSidebarOnOutsideClick(this.selection, clickedInsideSidebar)) {
      this.selection = closeSidebarState(this.selection);
      return;
    }

    // Consume the "just opened" flag on the first outside click.
    if (
      this.selection.viewMode === 'sidebar' &&
      this.selection.selectedItem &&
      sidebar &&
      !clickedInsideSidebar &&
      this.selection.isSidebarOpen
    ) {
      this.selection = { ...this.selection, isSidebarOpen: false };
    }
  }

  // ---------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------

  loadBoards(): void {
    this.boardEngine.getBoards().subscribe(boards => {
      this.boards = boards;

      if (boards.length) {
        this.selectedBoardId = boards[0].id;
        this.loadBoardColumnItems(this.selectedBoardId);
      }
    });
  }

  loadBoardColumnItems(boardId: number): void {
    this.boardEngine.getBoardItemsByBoardId(boardId).subscribe(columns => {
      const board = this.boards.find(b => b.id === boardId);
      const title = board?.title ?? '';

      this.boardView = toBoardView({
        id: boardId,
        title,
        boardColumns: columns,
      });
    });
  }

  onBoardSelection(boardId: number | null): void {
    if (boardId !== null) {
      this.selectedBoardId = boardId;
      this.loadBoardColumnItems(boardId);
    }
  }

  // ---------------------------------------------------------------------
  // Item creation
  // ---------------------------------------------------------------------

  openAddItemDialog(): void {
    const dialogRef = this.dialog.open(AddItemFormComponent, {
      width: '400px',
      data: {
        columns: this.boardView?.columns ?? [],
        boardId: this.selectedBoardId,
      },
    });

    dialogRef.afterClosed().subscribe((item: Item | undefined) => {
      if (item) {
        this.onItemCreated(item);
      }
    });
  }

  onItemCreated(item: Item): void {
    if (!this.boardView) {
      return;
    }

    const view: BoardItemView = toViewItem(item);
    this.boardView = applyItemCreated(this.boardView, view);
  }

  // ---------------------------------------------------------------------
  // Selection / detail views
  // ---------------------------------------------------------------------

  onItemClick(item: BoardItemView): void {
    this.selection = selectItem(this.selection, item);

    if (this.selection.viewMode === 'dialog') {
      this.openItemDetailDialog(item);
    }
  }

  openItemDetailDialog(item: BoardItemView): void {
    const dialogRef = this.dialog.open(ItemDetailDialogComponent, {
      width: '900px',
      height: '100vh',      // or 75vh
      maxHeight: '90vh',
      maxWidth: '95vw',
      autoFocus: false,
      data: {
        item,
        boardId: this.selectedBoardId,
      },
    });

    const attemptClose = () => {
      const componentInstance = dialogRef.componentInstance as ItemDetailDialogComponent;
      const hasChanges = componentInstance?.hasUnsavedChanges;

      if (!hasChanges) {
        dialogRef.close();
        return;
      }

      const confirmClose = window.confirm('You have unsaved changes.\n\nDiscard them?');

      if (confirmClose) {
        dialogRef.close();
      }
    };

    dialogRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') {
        attemptClose();
      }
    });

    dialogRef.backdropClick().subscribe(() => {
      attemptClose();
    });

    dialogRef.afterClosed().subscribe((updatedItem: BoardItemView | undefined) => {
      if (updatedItem) {
        this.onItemUpdated(updatedItem);
      }
    });
  }

  onItemUpdated(updatedItem: BoardItemView | Item): void {
    if (!this.boardView) {
      return;
    }

    const view: BoardItemView = 'raw' in updatedItem ? updatedItem : toViewItem(updatedItem);

    // Defensive: if the dialog/API response omits identity fields like
    // boardId/boardColumnId (since they aren't part of the edit form),
    // fall back to what's already in state rather than wiping it out.
    const existing = this.boardView.columns
      .flatMap(c => c.boardItems)
      .find(i => i.id === view.id);

    const merged: BoardItemView = existing
      ? {
        ...existing,
        ...view,
        boardId: view.boardId ?? existing.boardId,
        boardColumnId: view.boardColumnId ?? existing.boardColumnId,
      }
      : view;

    this.boardView = applyItemUpdate(this.boardView, merged);
  }

  toggleViewMode(): void {
    this.selection = toggleViewModeState(this.selection);
  }
}

/** Minimal mapper for items returned from the create dialog */
function toViewItem(item: Item): BoardItemView {
  const first = item.assigneeFirstName ?? '';
  const last = item.assigneeLastName ?? '';
  return {
    raw: item,
    id: item.id,
    title: item.title,
    description: item.description,
    statusId: item.statusId,
    priorityId: item.priorityId,
    priorityName: item.priority?.name,
    boardId: item.boardId,
    boardColumnId: item.boardColumnId,
    tags: item.tags ?? [],
    assigneeId: item.assigneeId,
    fullName: `${first} ${last}`.trim(),
    initials: (first.charAt(0) + last.charAt(0)).toUpperCase(),
    dueDate: item.dueDate,
    estimatedTime: item.estimatedTime,
    timeSpent: item.timeSpent,
    createdByFullName: item.createdByFullName,
    modifiedByFullName: item.modifiedByFullName,
  };
}