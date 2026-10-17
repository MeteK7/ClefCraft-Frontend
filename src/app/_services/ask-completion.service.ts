import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, catchError, map, of, switchMap, throwError } from 'rxjs';
import { BoardItemAskService } from './board-item-ask.service';
import {
  ASKS_CHANGED_MESSAGE,
  AskClosure,
  asksToReview,
  isStaleAskClosureError
} from '../models/board-item-ask.model';
import { AskClosureDialogComponent, AskClosureDialogData } from '../components/ask-closure-dialog/ask-closure-dialog.component';

/** How often the prompt reopens after the server reported changed asks, before giving up. */
const MAX_REVIEW_ATTEMPTS = 3;

/**
 * Completing an item that has asks: every save that moves an item to Done goes through here. It
 * loads the item's asks; when some are open or required it shows the prompt and passes the user's
 * AskClosure to the save, otherwise it saves without one. When the server says the asks changed
 * meanwhile, it reloads them and asks again.
 */
@Injectable({ providedIn: 'root' })
export class AskCompletionService {
  constructor(private askService: BoardItemAskService, private dialog: MatDialog) { }

  /**
   * Runs the save with the right AskClosure. Emits the save's result, or null when the user
   * cancelled the prompt (nothing was saved).
   */
  completeItem<T>(itemId: number, itemTitle: string, save: (closure: AskClosure | null) => Observable<T>): Observable<T | null> {
    const attempt = (attemptNumber: number, notice: string | null): Observable<T | null> =>
      this.review(itemId, itemTitle, notice).pipe(
        switchMap(outcome => outcome.cancelled
          ? of(null)
          : save(outcome.closure).pipe(
            catchError(error => isStaleAskClosureError(error) && attemptNumber < MAX_REVIEW_ATTEMPTS
              ? attempt(attemptNumber + 1, ASKS_CHANGED_MESSAGE)
              : throwError(() => error)))));

    return attempt(1, null);
  }

  /** Loads the item's asks and, when any need review, the user's choices about them. */
  review(itemId: number, itemTitle: string, notice: string | null = null): Observable<{ cancelled: boolean; closure: AskClosure | null }> {
    return this.askService.getForItem(itemId).pipe(
      switchMap(asks => {
        const reviewed = asksToReview(asks);
        if (reviewed.length === 0) {
          return of({ cancelled: false, closure: null });
        }

        const dialogRef = this.dialog.open<AskClosureDialogComponent, AskClosureDialogData, AskClosure>(
          AskClosureDialogComponent,
          { data: { itemTitle, asks: reviewed, notice }, autoFocus: false, maxWidth: '95vw' });

        return dialogRef.afterClosed().pipe(
          map(closure => closure ? { cancelled: false, closure } : { cancelled: true, closure: null }));
      }));
  }
}
