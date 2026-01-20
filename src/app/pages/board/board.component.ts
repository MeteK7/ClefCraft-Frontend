import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardColumnComponent } from '../board-column/board-column.component';
import { Board, Column, Item } from '../../models/board.model';
import { BoardService } from '../../_services/board.service';
import { AddItemFormComponent } from '../../components/add-item-form/add-item-form.component';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { ItemDetailDialogComponent } from '../item-detail-dialog/item-detail-dialog.component';
import { ItemDetailSidebarComponent } from '../item-detail-sidebar/item-detail-sidebar.component';
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule, BoardColumnComponent, DragDropModule, AddItemFormComponent, ItemDetailSidebarComponent],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.css']
})
export class BoardComponent implements OnInit {
  boards: Board[] = [];
  columns: Column[] = [];
  items: Item[] = [];
  selectedBoardId: number | null = null;
  selectedItem: Item | null = null;
  viewMode: 'dialog' | 'sidebar' = 'dialog'; // Default view mode
  isSidebarOpen: boolean = false;

  constructor(private boardService: BoardService, private dialog: MatDialog, private eRef: ElementRef) { }

  ngOnInit(): void {
    this.loadBoards();
    //this.loadBoardItems();
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event): void {
    const target = event.target as HTMLElement;
    const sidebar = document.querySelector('.sidebar');

    console.log('Selected item before checking click outside:', this.selectedItem);

    // If the sidebar is open and the click happens outside of it, close it
    if (this.viewMode === 'sidebar' && this.selectedItem && sidebar && !sidebar.contains(target)) {
      // Check if the sidebar is fully opened before allowing the click to close it
      if (this.isSidebarOpen) {
        // Reset the flag immediately after clicking, allowing the sidebar to keep open
        this.isSidebarOpen = false;
        return; // Do not close the sidebar on the first click
      }
      this.selectedItem = null;  // Close the sidebar
    }

    console.log('Click target:', target);

  }

  loadBoards(): void {
    this.boardService.getBoards().subscribe(boards => {
      this.boards = boards;

      if (boards.length) {
        this.selectedBoardId = boards[0].id; //Assigning default value
        this.loadBoardColumnItems(this.selectedBoardId); // Load columns and items for the first board
      }
    });
  }

  loadBoardColumnItems(boardId: number): void {
    this.boardService.getBoardItemsByBoardId(boardId).subscribe(columns => {
      this.columns = columns.map(column => ({
        ...column,
        boardItems: column.boardItems.map(item => ({
          ...item,
          createdByFullName: item.createdByFullName,
          modifiedByFullName: item.modifiedByFullName
        }))
      }));
    });
  }

  get allColumnIds(): string[] {
    return this.columns.map(column => 'column-' + column.title);
  }

  openAddItemDialog(): void {
    const dialogRef = this.dialog.open(AddItemFormComponent, {
      width: '400px',
      data: {
        columns: this.columns,
        boardId: this.selectedBoardId // Pass the selected board ID 
      } // Passing the columns to the form component
    });

    // Handle the event when the dialog is closed and a new item is created
    dialogRef.afterClosed().subscribe((item: Item | undefined) => {
      if (item) {
        this.onItemCreated(item);
      }
    });
  }

  onItemCreated(item: Item): void {
    const column = this.columns.find(c => c.id === item.boardColumnId);
    if (column) {
      column.boardItems.push(item);
    }

    //this.loadBoardColumnItems();
  }

  onBoardSelection(boardId: number | null): void {
    // Check if boardId is not null before proceeding
    if (boardId !== null) {
      this.selectedBoardId = boardId;
      this.loadBoardColumnItems(boardId); // Fetch data for the selected board
    }
  }

  onItemClick(item: Item): void {
    //console.log('Item clicked:', item);
    this.selectedItem = item; // Set selectedItem to the clicked item
    if (this.viewMode === 'dialog') {
      this.openItemDetailDialog(item);
    } else {
      this.openItemDetailSidebar(item);
    }
  }
  // Method to open item detail dialog
  openItemDetailDialog(item: Item): void {
    const dialogRef = this.dialog.open(ItemDetailDialogComponent, {
      width: '400px',
      data: { item }
    });

    dialogRef.afterClosed().subscribe((updatedItem: Item | undefined) => {
      if (updatedItem) {
        this.onItemUpdated(updatedItem);
      }
    });
  }

  // Method to handle opening the sidebar
  openItemDetailSidebar(item: Item): void {
    //this.selectedItem = item; // Set the selected item
    this.isSidebarOpen = true; // Mark the sidebar flag as true in case the user opens sidebar.
  }

  onItemUpdated(updatedItem: Item): void {
    const column = this.columns.find(c => c.id === updatedItem.boardColumnId);
    if (column) {
      const itemIndex = column.boardItems.findIndex(i => i.id === updatedItem.id);
      if (itemIndex !== -1) {
        column.boardItems[itemIndex] = updatedItem; // Update the item in the column
      }
    }
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'dialog' ? 'sidebar' : 'dialog';
    this.isSidebarOpen = false; //Flag
  }
}