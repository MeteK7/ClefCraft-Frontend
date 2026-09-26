import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Subject } from 'rxjs';

import { IdleSessionService } from './idle-session.service';
import { AuthService } from './auth.service';

const MINUTE = 60_000;

describe('IdleSessionService', () => {
  let isAuthenticated$: BehaviorSubject<boolean>;
  let auth: { isAuthenticated$: BehaviorSubject<boolean>; isLoggedIn: jasmine.Spy; logout: jasmine.Spy; refreshSession: jasmine.Spy };
  let dialogClosed$: Subject<'stay' | 'logout' | undefined>;
  let dialogRef: { afterClosed: () => Subject<'stay' | 'logout' | undefined>; close: jasmine.Spy };
  let dialog: { open: jasmine.Spy };
  let start: number;

  const tick = (ms: number) => jasmine.clock().tick(ms);
  const userActs = () => document.dispatchEvent(new Event('keydown'));

  function startService(): void {
    TestBed.inject(IdleSessionService).start();
  }

  beforeEach(() => {
    localStorage.clear();
    jasmine.clock().install();
    start = Date.UTC(2026, 8, 25, 9, 0, 0);
    jasmine.clock().mockDate(new Date(start));

    isAuthenticated$ = new BehaviorSubject(true);
    auth = {
      isAuthenticated$,
      isLoggedIn: jasmine.createSpy('isLoggedIn').and.returnValue(true),
      logout: jasmine.createSpy('logout'),
      refreshSession: jasmine.createSpy('refreshSession').and.resolveTo('new-token'),
    };

    dialogClosed$ = new Subject();
    dialogRef = {
      afterClosed: () => dialogClosed$,
      close: jasmine.createSpy('close').and.callFake(() => dialogClosed$.next(undefined)),
    };
    dialog = { open: jasmine.createSpy('open').and.returnValue(dialogRef) };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: MatDialog, useValue: dialog },
      ]
    });
    spyOnProperty(TestBed.inject(Router), 'url').and.returnValue('/board?openItemId=3');
  });

  afterEach(() => {
    isAuthenticated$.next(false); // stops the timer and detaches this instance from activity
    jasmine.clock().uninstall();
    localStorage.clear();
  });

  it('does nothing before the warning threshold', () => {
    startService();
    tick(14 * MINUTE - 1_000);

    expect(dialog.open).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('warns one minute before signing out, with the sign-out time', () => {
    startService();
    tick(14 * MINUTE);

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open.calls.mostRecent().args[1].data).toEqual({ signOutAt: start + 15 * MINUTE });
  });

  it('signs out after 15 idle minutes, keeping the page to return to', () => {
    startService();
    tick(15 * MINUTE);

    expect(auth.logout).toHaveBeenCalledOnceWith('/board?openItemId=3', 'idle');
  });

  it('closes the warning and restarts the clock when the user becomes active', () => {
    startService();
    tick(14 * MINUTE + 5_000);
    expect(dialog.open).toHaveBeenCalledTimes(1);

    userActs();
    tick(1_000);
    expect(dialogRef.close).toHaveBeenCalled();

    tick(13 * MINUTE);
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('counts activity in another tab (shared through localStorage)', () => {
    startService();
    tick(14 * MINUTE + 30_000);

    localStorage.setItem('lastActivityAt', String(Date.now()));
    tick(1 * MINUTE);

    expect(dialogRef.close).toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('"Stay signed in" restarts the clock', () => {
    startService();
    tick(14 * MINUTE + 5_000);

    dialogClosed$.next('stay');
    tick(14 * MINUTE - 10_000);

    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('signs out immediately on reload when the last activity is older than the limit', () => {
    localStorage.setItem('lastActivityAt', String(start - 16 * MINUTE));
    startService();

    expect(auth.logout).toHaveBeenCalledOnceWith('/board?openItemId=3', 'idle');
  });

  it('follows a sign-out made in another tab', () => {
    startService();
    auth.isLoggedIn.and.returnValue(false);
    tick(1_000);

    expect(auth.logout).toHaveBeenCalledOnceWith(undefined, undefined);
  });

  describe('keeping the server session alive', () => {
    it('refreshes while the user is active and the server deadline is near', () => {
      localStorage.setItem('refreshTokenExpiresAt', new Date(start + 6 * MINUTE).toISOString());
      startService();
      userActs();
      tick(1_000);

      expect(auth.refreshSession).toHaveBeenCalled();
    });

    it('does not refresh while the server deadline is still far away', () => {
      localStorage.setItem('refreshTokenExpiresAt', new Date(start + 10 * MINUTE).toISOString());
      startService();
      userActs();
      tick(1_000);

      expect(auth.refreshSession).not.toHaveBeenCalled();
    });

    it('does not refresh for an idle user, so background traffic cannot extend the session', () => {
      startService();
      tick(2 * MINUTE); // idle, no input
      localStorage.setItem('refreshTokenExpiresAt', new Date(Date.now() + 1 * MINUTE).toISOString());
      tick(1_000);

      expect(auth.refreshSession).not.toHaveBeenCalled();
    });

    it('signs out as expired when the server refuses the refresh (8-hour cap)', async () => {
      auth.refreshSession.and.resolveTo(null);
      localStorage.setItem('refreshTokenExpiresAt', new Date(start + 1 * MINUTE).toISOString());
      startService();
      await Promise.resolve();
      await Promise.resolve();

      expect(auth.logout).toHaveBeenCalledOnceWith('/board?openItemId=3', 'expired');
    });
  });
});
