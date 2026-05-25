import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

/**
 * The four possible outcomes from the scope selection dialog.
 *
 *  'this'             – update only the clicked occurrence
 *  'thisAndFollowing' – update this occurrence and every one after it
 *  'allPreserve'      – update the whole series, but skip occurrences
 *                       that already have field-level exceptions
 *  'allOverride'      – update the whole series, overwriting every
 *                       exception without mercy (requires confirmation)
 */
export type RecurrenceUpdateScope =
  | 'this'
  | 'thisAndFollowing'
  | 'allPreserve'
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

  /** Top-level scope choice */
  scope: 'this' | 'thisAndFollowing' | 'all' = 'this';

  /** Sub-choice shown only when scope === 'all' */
  seriesMode: 'preserve' | 'override' = 'preserve';

  /**
   * When the user picks "override" and clicks the primary button once,
   * we flip this flag and show a destructive-action warning.
   * A second click actually commits.
   */
  confirmingOverride = false;

  constructor(
    private dialogRef: MatDialogRef<RecurrenceScopeDialogComponent>
  ) {}

  // ── Event handlers ─────────────────────────────────────────────────────────

  onScopeChange(): void {
    this.confirmingOverride = false;
  }

  onSeriesModeChange(): void {
    this.confirmingOverride = false;
  }

  confirm(): void {
    // Gate: first click on "override all" shows the warning panel
    if (
      this.scope === 'all' &&
      this.seriesMode === 'override' &&
      !this.confirmingOverride
    ) {
      this.confirmingOverride = true;
      return;
    }

    this.dialogRef.close(this.resolvedScope);
  }

  /**
   * "Cancel" doubles as "Go back" when the override confirmation is visible.
   */
  cancel(): void {
    if (this.confirmingOverride) {
      this.confirmingOverride = false;
    } else {
      this.dialogRef.close(null);
    }
  }

  // ── Computed labels ────────────────────────────────────────────────────────

  get isDestructive(): boolean {
    return this.scope === 'all' && this.seriesMode === 'override';
  }

  get confirmButtonLabel(): string {
    if (this.isDestructive && !this.confirmingOverride) return 'Continue';
    return 'Apply';
  }

  get cancelButtonLabel(): string {
    return this.confirmingOverride ? 'Go back' : 'Cancel';
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private get resolvedScope(): RecurrenceUpdateScope {
    if (this.scope === 'this')             return 'this';
    if (this.scope === 'thisAndFollowing') return 'thisAndFollowing';
    return this.seriesMode === 'preserve'  ? 'allPreserve' : 'allOverride';
  }
}