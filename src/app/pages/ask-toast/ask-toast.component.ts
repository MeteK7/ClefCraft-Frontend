import { Component, Inject, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { AskEventPayload } from '../../_services/notification-realtime.service';

export interface AskToastText {
  icon: string;
  /** Who did what, e.g. "Ayse Recipient replied". */
  headline: string;
  /** The reply, reason or request the event is about. */
  message: string;
}

/** What the toast says about an ask event, in the receiver's terms. */
export function askToastText(event: AskEventPayload): AskToastText {
  const actor = event.actorFullName;

  switch (event.event) {
    case 'Requested':
      return { icon: 'group_add', headline: `${actor} asked you to help`, message: event.note };
    case 'Nudged':
      return { icon: 'notifications_active', headline: `${actor} nudged you`, message: event.note };
    case 'Replied':
      return { icon: 'chat', headline: `${actor} replied`, message: event.replyExcerpt ?? event.note };
    case 'Accepted':
      return { icon: 'check', headline: `${actor} accepted your ask`, message: event.note };
    case 'Declined':
      return { icon: 'block', headline: `${actor} declined your ask`, message: event.reason ?? event.note };
    case 'Completed':
      return {
        icon: 'task_alt',
        headline: event.actedOnBehalf ? `${actor} marked the ask done` : `${actor} marked your ask done`,
        message: event.replyExcerpt ?? event.note
      };
    case 'Reopened':
      return { icon: 'replay', headline: `${actor} reopened your ask`, message: event.note };
    case 'Changed':
      return { icon: 'edit', headline: `${actor} changed what they asked`, message: event.note };
    case 'Cancelled':
      return {
        icon: 'undo',
        headline: event.reason === 'ItemCompleted'
          ? 'An ask was closed when the item was completed'
          : event.reason === 'RecipientRemoved'
            ? 'An ask was closed: the recipient left the board'
            : `${actor} withdrew their ask`,
        message: event.note
      };
    default:
      return { icon: 'group_add', headline: `${actor} updated an ask`, message: event.note };
  }
}

/** A realtime ask event, with a link to the item. Shares the mention toast's look. */
@Component({
  selector: 'app-ask-toast',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './ask-toast.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['../mention-toast/mention-toast.component.css']
})
export class AskToastComponent implements OnInit {
  readonly duration = 12000;
  readonly text: AskToastText;
  isEntering = false;

  constructor(
    public snackBarRef: MatSnackBarRef<AskToastComponent>,
    @Inject(MAT_SNACK_BAR_DATA) public data: AskEventPayload
  ) {
    this.text = askToastText(data);
  }

  ngOnInit(): void {
    requestAnimationFrame(() => this.isEntering = true);
  }

  onActionClicked(): void {
    this.snackBarRef.dismissWithAction();
  }

  onDismiss(): void {
    this.snackBarRef.dismiss();
  }
}
