import { Component, Inject, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { MentionPayload } from '../../_services/notification-realtime.service';

@Component({
    selector: 'app-mention-toast',
    imports: [MatIconModule, MatButtonModule],
    templateUrl: './mention-toast.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./mention-toast.component.css']
})
export class MentionToastComponent implements OnInit {
  readonly duration = 12000;
  isEntering = false;

  constructor(
    public snackBarRef: MatSnackBarRef<MentionToastComponent>,
    @Inject(MAT_SNACK_BAR_DATA) public data: MentionPayload
  ) { }

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
