import { Injectable, InjectionToken, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { distinctUntilChanged } from 'rxjs';
import { AuthService } from './auth.service';
import { IdleWarningDialogComponent, IdleWarningDialogData } from '../pages/idle-warning-dialog/idle-warning-dialog.component';

export interface IdleSessionConfig {
  /** Sign out after this long without user input. Must match the backend's RefreshTokenIdleMinutes. */
  idleLimitMs: number;
  /** Show the "you'll be signed out" countdown this long before the limit. */
  warningMs: number;
  /** While the user is active, refresh once the server's idle deadline is closer than this. */
  refreshWhenRemainingMs: number;
}

export const IDLE_SESSION_CONFIG = new InjectionToken<IdleSessionConfig>('IDLE_SESSION_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    idleLimitMs: 3 * 60_000, // TEMP-E2E: revert to 15 * 60_000
    warningMs: 30_000, // TEMP-E2E: revert to 60_000
    refreshWhenRemainingMs: 90_000, // TEMP-E2E: revert to 7 * 60_000
  }),
});

// Shared by all tabs, so working in one tab keeps the others signed in and they lock together.
const LAST_ACTIVITY_KEY = 'lastActivityAt';

// Only real human input counts. API calls, polling and SignalR reconnects must never extend
// the session, or an unattended computer would keep itself signed in.
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];

// "Recently active" for the proactive refresh: the user touched the app within this window.
const RECENT_ACTIVITY_MS = 60_000;

const CHECK_INTERVAL_MS = 1_000;

/**
 * Screen-lock behavior: signs the user out after a period without input, warning them first.
 * The server enforces the same idle limit on refresh tokens, so this is the user-facing half
 * of the lock, not the only one.
 */
@Injectable({ providedIn: 'root' })
export class IdleSessionService {
  private readonly config = inject(IDLE_SESSION_CONFIG);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly zone = inject(NgZone);

  private started = false;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private warningRef: MatDialogRef<IdleWarningDialogComponent, 'stay' | 'logout'> | null = null;
  private lastRecordedAt = 0;

  /** Called once from the app shell. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    // Activity events fire constantly; keep them out of change detection.
    this.zone.runOutsideAngular(() => {
      for (const type of ACTIVITY_EVENTS) {
        document.addEventListener(type, this.onActivity, { capture: true, passive: true });
      }
    });

    this.authService.isAuthenticated$
      .pipe(distinctUntilChanged())
      .subscribe(isAuthenticated => isAuthenticated ? this.beginWatching() : this.stopWatching());
  }

  private readonly onActivity = (): void => {
    if (!this.checkTimer) {
      return;
    }

    const now = Date.now();
    // pointermove fires many times a second; one write per second is plenty.
    if (now - this.lastRecordedAt < 1_000) {
      return;
    }

    this.recordActivity(now);
  };

  private recordActivity(now = Date.now()): void {
    this.lastRecordedAt = now;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  }

  private lastActivityAt(): number {
    const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : Date.now();
  }

  private beginWatching(): void {
    // Keep an existing timestamp on reload: reopening the app after walking away must not
    // count as activity. A fresh login starts with none (cleared at sign-out).
    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      this.recordActivity();
    }

    this.zone.runOutsideAngular(() => {
      this.checkTimer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    });
    this.check();
  }

  private stopWatching(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    this.closeWarning();
  }

  private check(): void {
    // Tokens are shared through localStorage: if another tab signed out, so has this one.
    if (!this.authService.isLoggedIn()) {
      this.signOut();
      return;
    }

    const now = Date.now();
    const lastActivityAt = this.lastActivityAt();
    const idleMs = now - lastActivityAt;

    if (idleMs >= this.config.idleLimitMs) {
      this.signOut('idle');
      return;
    }

    if (idleMs >= this.config.idleLimitMs - this.config.warningMs) {
      this.openWarning(lastActivityAt + this.config.idleLimitMs);
      return;
    }

    // Activity here or in another tab dismisses the countdown.
    this.closeWarning();

    if (idleMs < RECENT_ACTIVITY_MS) {
      this.keepServerSessionAlive(now);
    }
  }

  /**
   * The server only sees API calls, so someone typing a long comment without saving would hit
   * the server's idle deadline and lose their work on save. While they are active, refresh
   * before that deadline.
   */
  private keepServerSessionAlive(now: number): void {
    const serverDeadline = Date.parse(localStorage.getItem('refreshTokenExpiresAt') ?? '');

    if (!Number.isFinite(serverDeadline) || serverDeadline - now > this.config.refreshWhenRemainingMs) {
      return;
    }

    this.authService.refreshSession().then(token => {
      // A failed refresh means the server ended the session (e.g. the 8-hour cap).
      if (!token && this.checkTimer) {
        this.signOut('expired');
      }
    });
  }

  private openWarning(signOutAt: number): void {
    if (this.warningRef) {
      return;
    }

    this.zone.run(() => {
      this.warningRef = this.dialog.open<IdleWarningDialogComponent, IdleWarningDialogData, 'stay' | 'logout'>(
        IdleWarningDialogComponent,
        { data: { signOutAt }, disableClose: true, width: '400px' }
      );

      this.warningRef.afterClosed().subscribe(choice => {
        this.warningRef = null;
        if (choice === 'stay') {
          this.recordActivity();
        } else if (choice === 'logout') {
          this.signOut();
        }
      });
    });
  }

  private closeWarning(): void {
    if (this.warningRef) {
      const ref = this.warningRef;
      this.warningRef = null;
      this.zone.run(() => ref.close());
    }
  }

  private signOut(reason?: 'idle' | 'expired'): void {
    this.stopWatching();
    this.zone.run(() => this.authService.logout(reason ? this.router.url : undefined, reason));
  }
}
