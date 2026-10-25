import { ChangeDetectionStrategy, Component, Inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

import { AskEventPayload } from '../../_services/notification-realtime.service';
import { AskToastText } from './ask-toast.component';

/** How many item titles the grouped toast names before "and N more". */
const NAMED_ITEMS = 2;

/** What one toast says about several ask events that arrived together. */
export function askGroupToastText(events: AskEventPayload[]): AskToastText {
  const titles = [...new Set(events.map(e => e.itemTitle))];
  const named = titles.slice(0, NAMED_ITEMS).join(', ');
  const more = titles.length - NAMED_ITEMS;

  return {
    icon: 'notifications',
    headline: `${events.length} updates on ${titles.length === 1 ? '1 item' : `${titles.length} items`}`,
    message: more > 0 ? `${named} and ${more} more` : named
  };
}

/**
 * Several ask events that arrived within a few seconds, as one toast. Its action opens "Waiting
 * for you", where what needs the user is listed. Shares the single toast's look.
 */
@Component({
  selector: 'app-ask-group-toast',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './ask-group-toast.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['../mention-toast/mention-toast.component.css']
})
export class AskGroupToastComponent implements OnInit {
  readonly duration = 12000;
  readonly text: AskToastText;
  isEntering = false;

  constructor(
    public snackBarRef: MatSnackBarRef<AskGroupToastComponent>,
    @Inject(MAT_SNACK_BAR_DATA) public data: AskEventPayload[]
  ) {
    this.text = askGroupToastText(data);
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
