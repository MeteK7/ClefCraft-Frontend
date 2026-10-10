import { Component, Inject, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';

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
    imports: [MatIconModule, MatButtonModule],
    templateUrl: './live-reminder-toast.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./live-reminder-toast.component.css']
})
export class LiveReminderToastComponent implements OnInit, OnDestroy {
  readonly defaultColor = '#4f87f5';
  readonly duration = 12000;
  isEntering = false;
  isPaused = false;

  // The toast times its own dismissal rather than using MatSnackBarConfig.duration, whose timer
  // can't be paused: hovering stops the countdown and leaving resumes it with the time that was left.
  private remainingMs = this.duration;
  private timerStartedAt = 0;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public snackBarRef: MatSnackBarRef<LiveReminderToastComponent>,
    @Inject(MAT_SNACK_BAR_DATA) public data: ReminderToastData
  ) {}

  ngOnInit(): void {
    // Trigger enter animation on next frame
    requestAnimationFrame(() => this.isEntering = true);
    this.startDismissTimer();
  }

  ngOnDestroy(): void {
    this.clearDismissTimer();
  }

  pauseDismissTimer(): void {
    if (this.isPaused) return;
    this.isPaused = true;

    if (this.dismissTimer !== null) {
      this.remainingMs -= Date.now() - this.timerStartedAt;
      this.clearDismissTimer();
    }
  }

  resumeDismissTimer(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.startDismissTimer();
  }

  private startDismissTimer(): void {
    this.timerStartedAt = Date.now();
    this.dismissTimer = setTimeout(() => {
      this.dismissTimer = null;
      this.snackBarRef.dismiss();
    }, Math.max(this.remainingMs, 0));
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
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