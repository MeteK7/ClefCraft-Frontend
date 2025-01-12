import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Item } from '../../models/board.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../../_services/board.service';
import { CalendarService } from '../../_services/calendar.service';

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
    private boardService: BoardService,
    private calendarService: CalendarService
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
    const currentDate = new Date();
    
    // Include time to avoid issues with date-only strings
    const formattedDate = currentDate.toISOString();
  
    const calendarEvent = {
      subject: this.data.item.title,
      comment: this.data.item.description,
      startDate: formattedDate, // Use the full ISO string
      endDate: formattedDate,
      allDayEvent: true,
      importance: 'Normal',
      linkedBoardItemId: this.data.item.id,
      userId: '944d0156-cb3d-466f-a1ea-5f53e3a10f8e',
    };
  
    this.calendarService.saveEvent(calendarEvent).subscribe(
      () => {
        console.log('Board item successfully marked as a calendar event.');
        this.dialogRef.close();
      },
      (error) => console.error('Error marking board item as a calendar event:', error)
    );
  }  
}