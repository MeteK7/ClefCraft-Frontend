import { Component, EventEmitter, Inject, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../../_services/board.service';
import { Item, Column } from '../../models/board.model';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-add-item-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-item-form.component.html',
  styleUrls: ['./add-item-form.component.css']
})
export class AddItemFormComponent {
  @Output() itemCreated = new EventEmitter<Item>();
  title = '';
  description = '';
  boardColumnId = 1; // Default column ID
  columns: Column[] = [];

  constructor(
    private boardService: BoardService,
    private dialogRef: MatDialogRef<AddItemFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { columns: Column[], boardId: number }
  ) {}

  ngOnInit(): void {
    const boardId = this.data.boardId;  // Use the passed boardId
    this.boardService.getBoardItemsByBoardId(boardId).subscribe(columns => {
      this.columns = columns;
    });
  }

  createItem(): void {
    const newItem = { title: this.title, description: this.description, boardColumnId: this.boardColumnId };
    this.boardService.createBoardItem(newItem).subscribe(item => {
      // this.itemCreated.emit(item);
      this.dialogRef.close(item);
      
      this.title = '';
      this.description = '';
      this.boardColumnId = 1;
    });
  }
}
