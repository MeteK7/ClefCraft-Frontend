import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface IdleWarningDialogData {
  /** Epoch ms at which the user will be signed out if nothing happens. */
  signOutAt: number;
}

@Component({
  selector: 'app-idle-warning-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './idle-warning-dialog.component.html',
  styleUrls: ['./idle-warning-dialog.component.css'],
})
export class IdleWarningDialogComponent implements OnInit, OnDestroy {
  secondsLeft = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private dialogRef: MatDialogRef<IdleWarningDialogComponent, 'stay' | 'logout'>,
    @Inject(MAT_DIALOG_DATA) private data: IdleWarningDialogData
  ) { }

  ngOnInit(): void {
    this.updateCountdown();
    this.timer = setInterval(() => this.updateCountdown(), 1_000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  staySignedIn(): void {
    this.dialogRef.close('stay');
  }

  signOut(): void {
    this.dialogRef.close('logout');
  }

  private updateCountdown(): void {
    this.secondsLeft = Math.max(0, Math.ceil((this.data.signOutAt - Date.now()) / 1_000));
  }
}
