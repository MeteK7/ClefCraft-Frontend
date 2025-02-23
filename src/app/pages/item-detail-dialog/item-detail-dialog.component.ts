import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Item, Tag } from '../../models/board.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../../_services/board.service';
import { CalendarService } from '../../_services/calendar.service';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';

@Component({
  selector: 'app-item-detail-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTabsModule, MatSelectModule, MatRadioModule],
  templateUrl: './item-detail-dialog.component.html',
  styleUrl: './item-detail-dialog.component.css'
})

export class ItemDetailDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ItemDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { item: Item },
    private boardService: BoardService,
    private calendarService: CalendarService
  ) { }
  
  markAsWorkedHistory: { dateCreated: string; actionBy: string }[] = []
  priorities = ['Low', 'Medium', 'High'];
  statuses = ['To Do', 'In Progress', 'Done'];
  availableAssignees = ['User 1', 'User 2', 'User 3']; // Replace with actual user list
  tags: Tag[] = [];
  
  ngOnInit(): void {
    this.fetchTags();
    this.fetchMarkAsWorkedHistory();
  }

  fetchMarkAsWorkedHistory(): void {
    // Replace with API call to fetch history
    this.calendarService.GetWorkHistory(this.data.item.id).subscribe(
      (history) => {
        this.markAsWorkedHistory = history.map((entry) => ({
          dateCreated: this.convertToLocalDate(entry.dateCreated).toISOString(),
          actionBy: entry.actionByFullName,
        }));
      },
      (error) => console.error('Error fetching Mark as Worked history:', error)
    );
  }
  
  convertToLocalDate(utcDate: string): Date {
    const date = new Date(utcDate); // Parses as UTC
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000); // Convert to local time
  }
  
  onSave(): void {
    // Logic to save the item
    this.boardService.updateBoardItem(this.data.item).subscribe(() => {
      this.dialogRef.close(this.data.item);
    });
  }
  
    fetchTags(): void {
    this.boardService.getTags().subscribe(
      (tags) => {
        this.tags = tags;  // Populate dropdown with tags
      },
      (error) => console.error('Error fetching tags:', error)
    );
  }
  
  addTag(newTag: string): void {
    if (!this.data.item.tags) {
      this.data.item.tags = []; // ✅ Ensure tags array is initialized
    }
    if (newTag && !this.data.item.tags.includes(newTag)) {
      this.data.item.tags.push(newTag);
    }
  }
  
  removeTag(tag: string): void {
    if (this.data.item.tags) {
      this.data.item.tags = this.data.item.tags.filter(t => t !== tag);
    }
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
    const currentDate = new Date().toISOString();
    const calendarEvent = {
      subject: this.data.item.title,
      comment: this.data.item.description,
      startDate: currentDate,
      endDate: currentDate,
      allDayEvent: true,
      importance: 'Normal',
      linkedBoardItemId: this.data.item.id,
      userId: '944d0156-cb3d-466f-a1ea-5f53e3a10f8e',
    };
    
    this.calendarService.saveEvent(calendarEvent).subscribe(
      () => {
        console.log('Board item successfully marked as a calendar event.');
        
        // Add to local history for immediate feedback
        this.markAsWorkedHistory.push({
          dateCreated: currentDate,
          actionBy: 'Current User', // Replace with logged-in user's name
        });
        
        this.dialogRef.close();
      },
      (error) => console.error('Error marking board item as a calendar event:', error)
    );
  }
  
}