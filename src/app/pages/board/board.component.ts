import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardColumnComponent } from '../board-column/board-column.component';
import { Board, Column, Item } from '../../models/board.model';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { BoardService } from '../../_services/board.service';
import { AddItemFormComponent } from '../../components/add-item-form/add-item-form.component';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule, BoardColumnComponent, DragDropModule, AddItemFormComponent],
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.css']
})
export class BoardComponent implements OnInit {
  boards: Board[] = [];
  columns: Column[] = [];
  items: Item[] = [];
  selectedBoardId: number | null = null;
  selectedItem: Item | null = null; // Track selected item for details
  viewMode: 'dialog' | 'sidebar' = 'dialog'; // Default to dialog

  constructor(private boardService: BoardService, private dialog: MatDialog) { }

  ngOnInit(): void {
    this.loadBoards();
    //this.loadBoardItems();
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
        items: column.boardItems
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
    const column = this.columns.find(c => c.id === item.id);
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
  

  onItemClicked(item: Item): void {
    this.selectedItem = item;
    // You can handle showing the details page here, for example:
    console.log('Item clicked:', item);
  }
}