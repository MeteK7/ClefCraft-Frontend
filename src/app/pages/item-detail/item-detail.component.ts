import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Item } from '../../models/board.model';
import { BoardService } from '../../_services/board.service';
import { MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.css'
})
export class ItemDetailComponent {
  @Input() item!: Item;
  @Output() itemUpdated = new EventEmitter<Item>();
  @Output() itemDeleted = new EventEmitter<number>();

  constructor(private boardService: BoardService, private dialogRef: MatDialogRef<ItemDetailComponent>) {}

  saveItem(): void {
    this.boardService.updateBoardItem(this.item).subscribe(
      updatedItem => {
        this.itemUpdated.emit(updatedItem);
        this.dialogRef.close();
      },
      error => {
        console.error('Error updating item', error);
      }
    );
  }

  deleteItem(): void {
    this.boardService.deleteBoardItem(this.item.id).subscribe(
      () => {
        this.itemDeleted.emit(this.item.id);
        this.dialogRef.close();
      },
      error => {
        console.error('Error deleting item', error);
      }
    );
  }
}