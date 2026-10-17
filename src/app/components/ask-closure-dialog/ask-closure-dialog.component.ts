import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import {
  AskAction,
  AskCancelReason,
  AskClosure,
  AskState,
  BoardItemAsk,
  buildAskClosure
} from '../../models/board-item-ask.model';

export interface AskClosureDialogData {
  itemTitle: string;
  /** The asks to review: the item's open asks and unmet requirements (asksToReview). */
  asks: BoardItemAsk[];
  /** Shown above the list when the prompt reopens because the asks changed. */
  notice?: string | null;
}

/**
 * Asks what happens to an item's open asks and unmet requirements when it is completed, and
 * returns the AskClosure to send with the save (or undefined when the user cancels).
 *
 * Accepted asks can be closed (the default, so nobody is credited by accident) or marked done for
 * their recipient, where the user may. Pending asks are always closed. Every required ask that
 * isn't marked done is completed past: the override list is derived from the choices and the
 * checkbox only confirms it.
 */
@Component({
  selector: 'app-ask-closure-dialog',
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatRadioModule],
  templateUrl: './ask-closure-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './ask-closure-dialog.component.css'
})
export class AskClosureDialogComponent {
  readonly AskState = AskState;

  /** Accepted asks the user chose to mark done for their recipient. */
  private readonly markDone = new Set<number>();

  /** The override list the user confirmed, as a key, so a change of choices asks again. */
  private confirmedOverrideKey: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<AskClosureDialogComponent, AskClosure>,
    @Inject(MAT_DIALOG_DATA) public data: AskClosureDialogData
  ) { }

  get closure(): AskClosure {
    return buildAskClosure(this.data.asks, this.markDone);
  }

  /** The required asks the item would be completed past, from the current choices. */
  get overriddenAsks(): BoardItemAsk[] {
    const ids = new Set(this.closure.overrideAskIds);
    return this.data.asks.filter(a => ids.has(a.id));
  }

  get overrideConfirmed(): boolean {
    return this.overriddenAsks.length === 0 || this.confirmedOverrideKey === this.overrideKey;
  }

  private get overrideKey(): string {
    return this.closure.overrideAskIds.join(',');
  }

  canMarkDone(ask: BoardItemAsk): boolean {
    return ask.state === AskState.Accepted && ask.allowedActions.includes(AskAction.CompleteOnBehalf);
  }

  isMarkedDone(ask: BoardItemAsk): boolean {
    return this.markDone.has(ask.id);
  }

  setMarkDone(ask: BoardItemAsk, done: boolean): void {
    if (done && this.canMarkDone(ask)) {
      this.markDone.add(ask.id);
    } else {
      this.markDone.delete(ask.id);
    }
  }

  setOverrideConfirmed(confirmed: boolean): void {
    this.confirmedOverrideKey = confirmed ? this.overrideKey : null;
  }

  /** Why a required ask that isn't open still counts as unmet. */
  unmetCause(ask: BoardItemAsk): string {
    if (ask.state === AskState.Declined) return 'declined';
    if (ask.state === AskState.Cancelled) {
      switch (ask.cancelReason) {
        case AskCancelReason.RecipientRemoved: return 'the recipient left the board';
        case AskCancelReason.ItemCompleted: return 'closed when the item was last completed';
        default: return 'withdrawn';
      }
    }
    return 'not done yet';
  }

  firstName(ask: BoardItemAsk): string {
    return ask.recipientFullName.split(' ')[0] || ask.recipientFullName;
  }

  complete(): void {
    if (!this.overrideConfirmed) return;
    this.dialogRef.close(this.closure);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
