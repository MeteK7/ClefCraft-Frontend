import { Component, EventEmitter, Inject, Input, Output } from '@angular/core';
import { Item } from '../../models/board.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.css'
})
export class ItemDetailComponent {
  @Input() item!: Item; // This will be used for sidebar
  @Output() itemUpdated = new EventEmitter<Item>();
  @Output() itemDeleted = new EventEmitter<number>();

  constructor(
    public dialogRef: MatDialogRef<ItemDetailComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { item: Item }
  ) {
    // Use the data from the dialog, if available
    if (data) {
      this.item = data.item;
    }
  }

  saveItem() {
    this.itemUpdated.emit(this.item);
    this.dialogRef.close(this.item); 
  }

  deleteItem() {
    this.itemDeleted.emit(this.item.id);
    this.dialogRef.close();
  }
}