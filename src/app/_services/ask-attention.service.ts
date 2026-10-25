import { Injectable, OnDestroy, signal } from '@angular/core';
import { Observable, Subject, Subscription, catchError, debounceTime, filter, of, switchMap } from 'rxjs';

import { AuthService } from './auth.service';
import { BoardItemAskService } from './board-item-ask.service';
import { NotificationRealtimeService } from './notification-realtime.service';

/** How long refresh requests are gathered into one count request. */
export const ATTENTION_REFRESH_DEBOUNCE_MS = 1_000;

/**
 * How many asks are the current user's move ("Waiting for you"), as the server counts them
 * (AskTurn). Kept current from the moments that can change it: any ask event pushed to the user,
 * the connection coming back (pushes sent while it was down are lost), the window or tab coming
 * back to the foreground, and the Chime In panel reloading after the user's own action (which
 * sends them no push). Null while signed out or not yet known.
 */
@Injectable({ providedIn: 'root' })
export class AskAttentionService implements OnDestroy {
  readonly count = signal<number | null>(null);

  private readonly trayRequests = new Subject<void>();

  /** Something asked for the "Waiting for you" list to open (a toast's action); the tray listens. */
  readonly trayRequests$: Observable<void> = this.trayRequests.asObservable();

  private readonly refreshes = new Subject<void>();
  private readonly subscriptions = new Subscription();
  private signedIn = false;

  constructor(askService: BoardItemAskService, realtime: NotificationRealtimeService, auth: AuthService) {
    this.subscriptions.add(this.refreshes.pipe(
      debounceTime(ATTENTION_REFRESH_DEBOUNCE_MS),
      filter(() => this.signedIn),
      // A failed count keeps the last one: the next refresh tries again.
      switchMap(() => askService.countMine('waiting').pipe(catchError(() => of(null))))
    ).subscribe(count => {
      if (count !== null && this.signedIn) this.count.set(count);
    }));

    this.subscriptions.add(auth.isAuthenticated$.subscribe(signedIn => {
      this.signedIn = signedIn;
      if (signedIn) {
        this.refresh();
      } else {
        this.count.set(null);
      }
    }));

    this.subscriptions.add(realtime.askEvents$.subscribe(() => this.refresh()));
    this.subscriptions.add(realtime.connected$.subscribe(() => this.refresh()));

    window.addEventListener('focus', this.onForeground);
    document.addEventListener('visibilitychange', this.onForeground);
  }

  /** Opens the "Waiting for you" list in the header. */
  openTray(): void {
    this.trayRequests.next();
  }

  /** Recounts soon, gathering refreshes that arrive together into one request. */
  refresh(): void {
    this.refreshes.next();
  }

  ngOnDestroy(): void {
    window.removeEventListener('focus', this.onForeground);
    document.removeEventListener('visibilitychange', this.onForeground);
    this.subscriptions.unsubscribe();
  }

  private readonly onForeground = (): void => {
    if (document.visibilityState === 'visible') this.refresh();
  };
}
