import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { BoardColumnComponent } from '../board-column/board-column.component';
import { BoardService } from '../../_services/board.service';
import { BoardView, toBoardView } from '../../board-engine/models/board-view.model';
import { BoardItemView, toBoardItemView } from '../../board-engine/models/board-item-view.model';
import { Board, Item } from '../../models/board.model';
import {
  applyItemCreated,
  applyItemDeleted,
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
import { ItemDetailDialogComponent, ItemDetailDialogResult } from '../item-detail-dialog/item-detail-dialog.component';
import { BoardDialogComponent } from '../board-dialog/board-dialog.component';
import { ItemDetailSidebarComponent } from '../item-detail-sidebar/item-detail-sidebar.component';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Params, Router } from '@angular/router';

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
export class BoardComponent implements OnInit, OnDestroy {
  boards: Board[] = [];
  boardView: BoardView | null = null;
  selectedBoardId: number | null = null;

  selection: SelectionState = {
    selectedItem: null,
    viewMode: 'dialog',
    isSidebarOpen: false,
  };

  private latestQueryParams: Params | null = null;

  private boardsSub?: Subscription;
  private boardColumnItemsSub?: Subscription;
  private queryParamsSub?: Subscription;

  constructor(private readonly router: Router,
    private boardEngine: BoardService,
    private dialog: MatDialog,
    private eRef: ElementRef,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    // Subscribed once for the component's lifetime so it also reacts to
    // deep-link query params that arrive after the initial load (e.g. from
    // a notification click while already on this page), without piling up
    // a new subscription every time loadBoardColumnItems() runs.
    this.queryParamsSub = this.route.queryParams.subscribe(params => {
      this.latestQueryParams = params;
      this.tryHandleDeepLinkedItem();
    });

    this.loadBoards();
  }

  ngOnDestroy(): void {
    this.boardsSub?.unsubscribe();
    this.boardColumnItemsSub?.unsubscribe();
    this.queryParamsSub?.unsubscribe();
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
    this.boardsSub = this.boardEngine.getBoards().subscribe(boards => {
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
    this.boardColumnItemsSub?.unsubscribe();
    this.boardColumnItemsSub = this.boardEngine.getBoardItemsByBoardId(boardId).subscribe(columns => {
      const board = this.boards.find(b => b.id === boardId);
      const title = board?.title ?? '';

      this.boardView = toBoardView({
        id: boardId,
        title,
        boardColumns: columns,
      });

      // Re-check the latest query params now that the view has populated —
      // this covers deep-link params that arrived before the board data did.
      this.tryHandleDeepLinkedItem();
    });
  }

  private tryHandleDeepLinkedItem(): void {
    const params = this.latestQueryParams;
    const targetIdStr = params?.['openItemId'];
    if (!targetIdStr || !this.boardView) return;

    const targetId = Number(targetIdStr);
    const commentIdStr = params?.['commentId'];
    const focusCommentId = commentIdStr ? Number(commentIdStr) : null;

    const matchedItem = this.boardView.columns
      .flatMap(c => c.boardItems)
      .find(item => item.id === targetId);

    if (matchedItem) {
      this.selection = selectItem(this.selection, matchedItem);

      if (this.selection.viewMode === 'dialog') {
        this.openItemDetailDialog(matchedItem, focusCommentId);
      }

      // Consume the deep-link params so this doesn't re-trigger.
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      });
    }
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
    if (!this.selectedBoardId) {
      return;
    }
    this.openItemDetailDialog(null);
  }

  // ---------------------------------------------------------------------
  // Board creation
  // ---------------------------------------------------------------------

  openCreateBoardDialog(): void {
    const dialogRef = this.dialog.open(BoardDialogComponent, {
      data: { board: null },
    });

    dialogRef.afterClosed().subscribe((result: { title: string } | null) => {
      if (!result) return;

      this.boardEngine.createBoard({ title: result.title }).subscribe(newBoard => {
        this.boards = [...this.boards, newBoard];
        this.selectedBoardId = newBoard.id;
        this.loadBoardColumnItems(newBoard.id);
      });
    });
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

  openItemDetailDialog(item: BoardItemView | null, focusCommentId: number | null = null): void {
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
        focusCommentId,
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

    dialogRef.afterClosed().subscribe((result: ItemDetailDialogResult | undefined) => {
      if (!result) return;

      if (result.type === 'deleted') {
        this.onItemDeleted(result.itemId);
        return;
      }

      item ? this.onItemUpdated(result.item) : this.onItemCreated(result.item);
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

  onItemDeleted(itemId: number): void {
    if (!this.boardView) {
      return;
    }

    this.boardView = applyItemDeleted(this.boardView, itemId);

    if (this.selection.selectedItem?.id === itemId) {
      this.selection = closeSidebarState(this.selection);
    }
  }

  toggleViewMode(): void {
    this.selection = toggleViewModeState(this.selection);
  }
}