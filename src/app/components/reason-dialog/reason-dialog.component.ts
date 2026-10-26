import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ReasonDialogData {
  title: string;
  /** One line saying what the action does. */
  message: string;
  /** What it's about (an ask's note), shown on its own line in quotes; nothing when empty. */
  quote?: string | null;
  /** The reason field's label, saying it's optional. */
  label: string;
  /** Who will see the reason. */
  hint: string;
  confirmLabel: string;
  maxLength: number;
}

/** The message's id: the open config passes it as ariaDescribedBy, so the dialog is described by it. */
export const REASON_DIALOG_MESSAGE_ID = 'reason-dialog-message';

/**
 * A confirmation that asks for an optional reason: declining an ask, waiving a requirement. Its
 * confirm button is "dismissive": the action says no or lets go of something, legitimately, so it
 * is neither destructive (red) nor the primary action (filled).
 *
 * Closes with the trimmed reason ('' when none) on confirm, and undefined on Cancel, Esc or a
 * backdrop click; callers act only on a string. Open it with disableClose: true. The dialog then
 * decides itself: a backdrop click cancels only while nothing is typed, so a stray click can't
 * lose a reason, while Esc and Cancel always do.
 */
@Component({
  selector: 'app-reason-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TextFieldModule],
  templateUrl: './reason-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './reason-dialog.component.css'
})
export class ReasonDialogComponent {
  readonly messageId = REASON_DIALOG_MESSAGE_ID;
  readonly hintId = 'reason-dialog-hint';
  readonly countId = 'reason-dialog-count';
  text = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ReasonDialogData,
    private dialogRef: MatDialogRef<ReasonDialogComponent, string>
  ) {
    dialogRef.backdropClick().pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.hasText) dialogRef.close(undefined);
    });
    dialogRef.keydownEvents().pipe(takeUntilDestroyed()).subscribe(event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dialogRef.close(undefined);
      }
    });
  }

  get hasText(): boolean {
    return this.text.trim().length > 0;
  }

  confirm(): void {
    this.dialogRef.close(this.text.trim());
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  /** Ctrl+Enter (Cmd+Enter on a Mac) confirms, as sending a reply does; Enter adds a line. */
  onFieldKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.confirm();
    }
  }
}
