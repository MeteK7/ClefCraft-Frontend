import { ChangeDetectionStrategy, Component, ElementRef, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AskAttentionService } from '../../_services/ask-attention.service';
import { BoardItemAskService } from '../../_services/board-item-ask.service';
import { AskState, AskTurnReason, BoardItemAsk, askDayFormat, askLink } from '../../models/board-item-ask.model';

/** One board's asks in the tray, in the server's order. */
export interface WaitingBoard {
  boardId: number;
  boardTitle: string;
  asks: BoardItemAsk[];
}

/** Why the ask is waiting on you, in your terms. */
export function waitingReason(ask: BoardItemAsk): string {
  switch (ask.yourMove) {
    case AskTurnReason.Respond:
      return 'Asked you to help';
    case AskTurnReason.Deliver:
      return ask.expectsAnswer && !ask.isAnswered
        ? 'You accepted. An answer is needed'
        : 'You accepted. Mark it done when finished';
    case AskTurnReason.ResolveRequirement:
      return ask.state === AskState.Cancelled
        ? 'Cancelled and required: ask someone else or waive it'
        : 'Declined and required: ask someone else or waive it';
    default:
      return '';
  }
}

/** Who the ask is with: who asked you, or whom you asked. */
export function waitingWith(ask: BoardItemAsk): string {
  return ask.yourMove === AskTurnReason.ResolveRequirement
    ? `You asked ${ask.recipientFullName}`
    : `From ${ask.requestedByFullName}`;
}

/** The asks in server order, grouped by board as they come. */
export function groupByBoard(asks: BoardItemAsk[]): WaitingBoard[] {
  const groups: WaitingBoard[] = [];
  for (const ask of asks) {
    let group = groups[groups.length - 1];
    if (!group || group.boardId !== ask.boardId) {
      group = { boardId: ask.boardId, boardTitle: ask.boardTitle ?? 'Board', asks: [] };
      groups.push(group);
    }
    group.asks.push(ask);
  }
  return groups;
}

/**
 * "Waiting for you" in the header: a count of the asks that are your move, across every board
 * you're on, and the list of them on demand. A row opens the item with that ask in view. The
 * count only shows above zero; the list empties as you act, and is never something to clear.
 */
@Component({
  selector: 'app-waiting-tray',
  imports: [DatePipe, RouterLink, OverlayModule, MatIconModule, MatTooltipModule],
  templateUrl: './waiting-tray.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './waiting-tray.component.css'
})
export class WaitingTrayComponent {
  @ViewChild('trayButton') private trayButton?: ElementRef<HTMLButtonElement>;

  readonly reason = waitingReason;
  readonly withWhom = waitingWith;
  readonly dayFormat = askDayFormat;
  readonly link = (ask: BoardItemAsk) => askLink(ask.boardId, ask.boardItemId, ask.id);

  /** Under the button, right edges aligned; above it when there's no room below. */
  readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 }
  ];

  open = false;
  isLoading = false;
  failed = false;
  boards: WaitingBoard[] = [];

  constructor(public attention: AskAttentionService, private askService: BoardItemAskService) {
    // A toast's "View" for several updates opens the list.
    attention.trayRequests$.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.open && this.attention.count() !== null) this.toggle();
    });
  }

  get count(): number {
    return this.attention.count() ?? 0;
  }

  get label(): string {
    const count = this.count;
    return count === 0 ? 'Waiting for you: nothing' : `Waiting for you: ${count}`;
  }

  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.open = true;
      this.load();
    }
  }

  close(returnFocus = false): void {
    if (!this.open) return;
    this.open = false;
    if (returnFocus) this.trayButton?.nativeElement.focus();
  }

  /** A click elsewhere closes the list; the button's own click toggles it instead. */
  onOutsideClick(event: MouseEvent): void {
    if (!this.trayButton?.nativeElement.contains(event.target as Node)) this.close();
  }

  /** Esc closes the list and returns to the button. */
  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    }
  }

  /** Focus moves into the list when it opens, so the keyboard can go straight down it. */
  onPanelAttached(): void {
    setTimeout(() => this.focusIntoPanel());
  }

  /**
   * The first row, or the panel while there are none yet (loading, empty). Called again once the
   * list has loaded, unless focus already moved on within the panel.
   */
  private focusIntoPanel(): void {
    const panel = document.getElementById('waiting-tray-panel');
    if (!panel) return;
    const active = document.activeElement;
    if (active && active !== panel && panel.contains(active)) return;
    (panel.querySelector<HTMLElement>('.tray-row') ?? panel).focus();
  }

  private load(): void {
    this.isLoading = true;
    this.failed = false;
    this.askService.getMine('waiting').subscribe({
      next: asks => {
        this.boards = groupByBoard(asks);
        this.isLoading = false;
        // The list is the fresher count.
        this.attention.count.set(asks.length);
        // Once the rows are rendered.
        setTimeout(() => this.focusIntoPanel());
      },
      error: () => {
        this.isLoading = false;
        this.failed = true;
      }
    });
  }
}
