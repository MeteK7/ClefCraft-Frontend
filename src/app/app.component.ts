import { Component, NgZone, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { FooterComponent } from './components/footer/footer.component';
import { AuthService } from './_services/auth.service';
import { ThemeService } from './services/theme.service';
import { NotificationRealtimeService, MentionPayload, ReminderPayload, AskEventPayload } from './_services/notification-realtime.service';
import { MentionToastComponent } from './pages/mention-toast/mention-toast.component';
import { AskToastComponent, leadsToAsk } from './pages/ask-toast/ask-toast.component';
import { AskGroupToastComponent } from './pages/ask-toast/ask-group-toast.component';
import { AskToastCoordinator } from './_services/ask-toast-coordinator.service';
import { AskAttentionService } from './_services/ask-attention.service';
import { askLink } from './models/board-item-ask.model';
import { OpenAskItemsService } from './_services/open-ask-items.service';
import { LiveReminderToastComponent } from './pages/live-reminder-toast/live-reminder-toast.component';
import { IdleSessionService } from './_services/idle-session.service';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, RouterModule, HeaderComponent, SidebarComponent, FooterComponent],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Activity Management';

  constructor(
    private authService: AuthService,
    public themeService: ThemeService,
    // Reminders and mentions arrive whenever the server sends them, whatever page the user is
    // on, and the server doesn't resend them — so they're listened for at the app shell, not in
    // a page component that may not be showing.
    private notificationRealtimeService: NotificationRealtimeService,
    private idleSessionService: IdleSessionService,
    private openAskItems: OpenAskItemsService,
    private snackBar: MatSnackBar,
    private router: Router,
    private zone: NgZone,
    private askToasts: AskToastCoordinator,
    private askAttention: AskAttentionService
  ) { }

  ngOnInit() {
    this.authService.initializeUser();
    this.idleSessionService.start();
    this.listenForReminders();
    this.listenForMentions();
    this.listenForAskEvents();
  }

  private listenForReminders(): void {
    this.notificationRealtimeService.reminders$.subscribe({
      next: reminder => this.zone.run(() => this.displayReminderToast(reminder)),
      error: err => console.error('Reminder channel broadcast error:', err),
    });
  }

  private displayReminderToast(reminder: ReminderPayload): void {
    // The message already names the event and how soon it starts ("<Subject> starts in N
    // minutes"); colour and start time aren't in the payload, so the toast uses its defaults.
    // No `duration`: the toast dismisses itself so hovering can pause its countdown.
    const ref = this.snackBar.openFromComponent(LiveReminderToastComponent, {
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['clean-reminder-viewport-override'],
      data: { message: reminder.message, eventId: reminder.eventId },
    });

    ref.onAction().subscribe(() =>
      this.router.navigate(['/calendar'], { queryParams: { eventId: reminder.eventId } }));
  }

  private listenForMentions(): void {
    this.notificationRealtimeService.mentions$.subscribe({
      next: mention => this.zone.run(() => this.displayMentionToast(mention)),
      error: err => console.error('Mention channel broadcast error:', err),
    });
  }

  private displayMentionToast(mention: MentionPayload): void {
    const ref = this.snackBar.openFromComponent(MentionToastComponent, {
      duration: 12_000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['clean-reminder-viewport-override'],
      data: mention,
    });

    ref.onAction().subscribe(() => this.openMentionTarget(mention));
  }

  private openMentionTarget(mention: MentionPayload): void {
    if (mention.entityType === 'BoardItem') {
      const queryParams: Record<string, any> = { openItemId: mention.entityId, commentId: mention.commentId };
      if (mention.boardId != null) queryParams['boardId'] = mention.boardId;
      this.router.navigate(['/board'], { queryParams });
    } else if (mention.entityType === 'CalendarEvent') {
      this.router.navigate(['/calendar'], { queryParams: { eventId: mention.entityId, commentId: mention.commentId } });
    }
  }

  // An item whose asks are on screen refreshes itself (its panel listens too), so a toast there
  // would only repeat what the user is looking at. The rest go to the coordinator, which shows them
  // in one visible tab, a few seconds' worth at a time, and not while the user is typing.
  private listenForAskEvents(): void {
    this.notificationRealtimeService.askEvents$.subscribe({
      next: event => {
        if (!this.openAskItems.isOpen(event.boardItemId)) this.askToasts.offer(event);
      },
      error: err => console.error('Ask channel broadcast error:', err),
    });

    // Checked again on the way out: the user may have opened the item while the batch waited.
    this.askToasts.batches$.subscribe(batch => this.zone.run(() => {
      const unseen = batch.filter(event => !this.openAskItems.isOpen(event.boardItemId));
      if (unseen.length === 1) this.displayAskToast(unseen[0]);
      else if (unseen.length > 1) this.displayAskGroupToast(unseen);
    }));
  }

  private displayAskToast(event: AskEventPayload): void {
    const ref = this.snackBar.openFromComponent(AskToastComponent, {
      duration: 12_000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['clean-reminder-viewport-override'],
      data: event,
    });

    ref.onAction().subscribe(() =>
      this.router.navigate(['/board'], { queryParams: askLink(event.boardId, event.boardItemId, leadsToAsk(event) ? event.askId : null) }));
  }

  // Several at once: one toast, whose action opens "Waiting for you".
  private displayAskGroupToast(events: AskEventPayload[]): void {
    const ref = this.snackBar.openFromComponent(AskGroupToastComponent, {
      duration: 12_000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['clean-reminder-viewport-override'],
      data: events,
    });

    ref.onAction().subscribe(() => this.askAttention.openTray());
  }
}
