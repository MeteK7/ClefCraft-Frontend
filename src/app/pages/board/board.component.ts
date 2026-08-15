import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardColumnComponent } from '../board-column/board-column.component';
import { BoardService } from '../../_services/board.service';
import { BoardView, toBoardView } from '../../board-engine/models/board-view.model';
import { BoardItemView, toBoardItemView } from '../../board-engine/models/board-item-view.model';
import { Board, Item } from '../../models/board.model';
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
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { ItemDetailDialogComponent } from '../item-detail-dialog/item-detail-dialog.component';
import { ItemDetailSidebarComponent } from '../item-detail-sidebar/item-detail-sidebar.component';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BoardColumnComponent,
    DragDropModule,
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

  constructor(private readonly router: Router,
    private boardEngine: BoardService,
    private dialog: MatDialog,
    private eRef: ElementRef,
    private route: ActivatedRoute
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
        const requestedBoardId = Number(this.route.snapshot.queryParamMap.get('boardId'));
        const initialBoardId = boards.some(b => b.id === requestedBoardId)
          ? requestedBoardId
          : boards[0].id;

        this.selectedBoardId = initialBoardId;
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

      // Check query params after the view configuration has populated
      this.checkDeepLinkedItem();
    });
  }

  private checkDeepLinkedItem(): void {
    this.route.queryParams.subscribe(params => {
      const targetIdStr = params['openItemId'];
      if (!targetIdStr || !this.boardView) return;

      const targetId = Number(targetIdStr);

      const matchedItem = this.boardView.columns
        .flatMap(c => c.boardItems)
        .find(item => item.id === targetId);

      if (matchedItem) {
        this.selection = selectItem(this.selection, matchedItem);

        if (this.selection.viewMode === 'dialog') {
          this.openItemDetailDialog(matchedItem);
        }

        // Consume the deep-link params so this doesn't re-trigger.
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });
      }
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
    this.openItemDetailDialog(null);
  }

  onItemCreated(item: Item): void {
    if (!this.boardView) {
      return;
    }

    const view: BoardItemView = toBoardItemView(item);
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

  openItemDetailDialog(item: BoardItemView | null): void {
    const dialogRef = this.dialog.open(ItemDetailDialogComponent, {
      width: '900px',
      height: '100vh',
      maxHeight: '90vh',
      maxWidth: '95vw',
      autoFocus: false,
      data: {
        item: item?.raw ?? null,
        boardId: this.selectedBoardId,
        columns: this.boardView?.columns ?? [],
      },
    });

    const attemptClose = () => {
      const componentInstance = dialogRef.componentInstance as ItemDetailDialogComponent;
      const hasChanges = componentInstance?.hasUnsavedChanges;

      if (!hasChanges) {
        dialogRef.close();
        return;
      }

      if (window.confirm('You have unsaved changes.\n\nDiscard them?')) {
        dialogRef.close();
      }
    };

    dialogRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') attemptClose();
    });

    dialogRef.backdropClick().subscribe(() => attemptClose());

    dialogRef.afterClosed().subscribe((result: Item | undefined) => {
      if (!result) return;
      item ? this.onItemUpdated(result) : this.onItemCreated(result);
    });
  }

  onItemUpdated(updatedItem: BoardItemView | Item): void {
    if (!this.boardView) {
      return;
    }

    const view: BoardItemView = 'raw' in updatedItem ? updatedItem : toBoardItemView(updatedItem);

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