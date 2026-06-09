import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

export interface ReminderToastData {
  message: string;
  eventId: number;
  color?: string;
  timeUntil?: string;  // e.g. "Starts in 10 minutes · 2:00 PM"
}

@Component({
  selector: 'app-live-reminder-toast',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './live-reminder-toast.component.html',
  styleUrls: ['./live-reminder-toast.component.css']
})
export class LiveReminderToastComponent implements OnInit {
  readonly defaultColor = '#4f87f5';
  readonly duration = 12000;
  isEntering = false;

  constructor(
    public snackBarRef: MatSnackBarRef<LiveReminderToastComponent>,
    @Inject(MAT_SNACK_BAR_DATA) public data: ReminderToastData
  ) {}

  ngOnInit(): void {
    // Trigger enter animation on next frame
    requestAnimationFrame(() => this.isEntering = true);
  }

  /** Convert hex color to rgba with given alpha — used for icon background tint */
  colorWithAlpha(hex: string | undefined, alpha: number): string {
    const h = hex ?? this.defaultColor;
    const r = parseInt(h.slice(1, 3), 16);
    const g = parseInt(h.slice(3, 5), 16);
    const b = parseInt(h.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  onActionClicked(): void {
    this.snackBarRef.dismissWithAction();
  }

  onDismiss(): void {
    this.snackBarRef.dismiss();
  }
}