import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

export type RecurrenceUpdateScope =
  | 'this'
  | 'thisAndFollowing'
  | 'allPreserve'
  | 'allOverride';

type ConfirmationMode =
  | 'none'
  | 'thisAndFollowing'
  | 'allOverride';

@Component({
  selector: 'app-recurrence-scope-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatRadioModule,
    MatIconModule,
    MatDividerModule,
  ],
  templateUrl: './recurrence-scope-dialog.component.html',
  styleUrls: ['./recurrence-scope-dialog.component.css'],
})
export class RecurrenceScopeDialogComponent {

  scope: 'this' | 'thisAndFollowing' | 'all' = 'this';

  seriesMode: 'preserve' | 'override' = 'preserve';

  confirmationMode: ConfirmationMode = 'none';

  constructor(
    private dialogRef: MatDialogRef<RecurrenceScopeDialogComponent>
  ) {}

  onScopeChange(): void {
    this.confirmationMode = 'none';
  }

  onSeriesModeChange(): void {
    this.confirmationMode = 'none';
  }

  confirm(): void {

    // First confirmation for "This and following"
    if (
      this.scope === 'thisAndFollowing' &&
      this.confirmationMode !== 'thisAndFollowing'
    ) {
      this.confirmationMode = 'thisAndFollowing';
      return;
    }

    // First confirmation for "Override all"
    if (
      this.scope === 'all' &&
      this.seriesMode === 'override' &&
      this.confirmationMode !== 'allOverride'
    ) {
      this.confirmationMode = 'allOverride';
      return;
    }

    this.dialogRef.close(this.resolvedScope);
  }

  cancel(): void {
    if (this.confirmationMode !== 'none') {
      this.confirmationMode = 'none';
      return;
    }

    this.dialogRef.close(null);
  }

  get isDestructive(): boolean {
    return (
      this.scope === 'all' &&
      this.seriesMode === 'override'
    );
  }

  get confirmButtonLabel(): string {

    if (
      this.scope === 'thisAndFollowing' &&
      this.confirmationMode !== 'thisAndFollowing'
    ) {
      return 'Continue';
    }

    if (
      this.scope === 'all' &&
      this.seriesMode === 'override' &&
      this.confirmationMode !== 'allOverride'
    ) {
      return 'Continue';
    }

    return 'Apply';
  }

  get cancelButtonLabel(): string {
    return this.confirmationMode !== 'none'
      ? 'Go back'
      : 'Cancel';
  }

  private get resolvedScope(): RecurrenceUpdateScope {

    if (this.scope === 'this') {
      return 'this';
    }

    if (this.scope === 'thisAndFollowing') {
      return 'thisAndFollowing';
    }

    return this.seriesMode === 'preserve'
      ? 'allPreserve'
      : 'allOverride';
  }
}