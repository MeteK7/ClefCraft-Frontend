import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

@Component({
  selector: 'app-live-reminder-toast',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './live-reminder-toast.component.html',
  styleUrls: ['./live-reminder-toast.component.css']
})
export class LiveReminderToastComponent {
  constructor(
    public snackBarRef: MatSnackBarRef<LiveReminderToastComponent>,
    @Inject(MAT_SNACK_BAR_DATA) public data: { message: string; eventId: number; color?: string }
  ) {}

  onActionClicked(): void {
    // Dismiss and bubble the specific action context back up to our primary subscription listener
    this.snackBarRef.dismissWithAction();
  }
}