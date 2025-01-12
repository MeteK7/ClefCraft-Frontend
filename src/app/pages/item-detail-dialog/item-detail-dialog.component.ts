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
  
    // Map BoardItem properties to CreateCalendarEventCommand fields
    const calendarEvent = {
      subject: this.data.item.title, // Map Title to Subject
      comment: this.data.item.description, // Map Description to Comment
      startDate: currentDate.toISOString(), // Use current date
      endDate: currentDate.toISOString(),   // Same for end date
      allDayEvent: true,                    // Default to all-day event
      importance: 'Normal',                 // Default importance
      linkedBoardItemId: this.data.item.id, // Link to the BoardItem
      userId: '944d0156-cb3d-466f-a1ea-5f53e3a10f8e', // Replace with dynamic user ID
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