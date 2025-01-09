import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Item } from '../../models/board.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../../_services/board.service';

@Component({
  selector: 'app-item-detail-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './item-detail-dialog.component.html',
  styleUrl: './item-detail-dialog.component.css'
})

export class ItemDetailDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ItemDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { item: Item },
    private boardService: BoardService
  ) {}

  onSave(): void {
    // Logic to save the item
    this.boardService.updateBoardItem(this.data.item).subscribe(() => {
      this.dialogRef.close(this.data.item);
    });
  }

  onDelete(): void {
    this.boardService.deleteBoardItem(this.data.item.id).subscribe(() => {
      this.dialogRef.close(this.data.item);
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
  markAsWorked(): void {
    const currentDate = new Date(); // Use today's date as the event date
    const event = {
      subject: this.data.item.title, // Use the task title as the event subject
      description: this.data.item.description, // Use the task description
      startDate: currentDate,
      endDate: currentDate,
      userId: '944d0156-cb3d-466f-a1ea-5f53e3a10f8e', // Replace with dynamic userId
    };

    this.boardService.createBoardItem(event).subscribe(
      () => {
        console.log('Task marked as worked and saved as an event.');
        this.dialogRef.close();
      },
      (error) => console.error('Error marking task as worked:', error)
    );
  }
}