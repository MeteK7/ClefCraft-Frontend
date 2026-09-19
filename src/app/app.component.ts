import { Component, NgZone, OnInit } from '@angular/core';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { FooterComponent } from './components/footer/footer.component';
import { AuthService } from './_services/auth.service';
import { ThemeService } from './services/theme.service';
import { NotificationRealtimeService, MentionPayload } from './_services/notification-realtime.service';
import { MentionToastComponent } from './pages/mention-toast/mention-toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterModule, HeaderComponent, SidebarComponent, FooterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'Activity Management';

  constructor(
    private authService: AuthService,
    public themeService: ThemeService,
    // Mentions can happen on a BoardItem or a CalendarEvent comment while the user is on any
    // page (unlike calendar reminders, which are only ever relevant while already on the
    // Calendar page) — so this listener lives at the app shell, not a specific page component.
    private notificationRealtimeService: NotificationRealtimeService,
    private snackBar: MatSnackBar,
    private router: Router,
    private zone: NgZone
  ) { }

  ngOnInit() {
    this.authService.initializeUser();
    this.listenForMentions();
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
}