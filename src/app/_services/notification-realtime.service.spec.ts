import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import * as signalR from '@microsoft/signalr';

import { NotificationRealtimeService, RETRY_INITIAL_DELAY_MS, RETRY_MAX_DELAY_MS } from './notification-realtime.service';
import { AuthService } from './auth.service';

describe('NotificationRealtimeService', () => {
  let isAuthenticated$: BehaviorSubject<boolean>;
  let connection: jasmine.SpyObj<signalR.HubConnection> & { state: signalR.HubConnectionState };
  let buildSpy: jasmine.Spy;
  let accessToken: string | null;

  /** Outcomes for upcoming start() calls; an empty list means the backend is reachable. */
  let startOutcomes: Array<'fail' | 'ok'>;
  /** How long a start() takes; 0 resolves on the next microtask. */
  let startDurationMs: number;
  let startsInFlight: number;
  let maxStartsInFlight: number;
  let closeCallbacks: Array<(error?: Error) => void>;

  /** Lets the queued start/stop transitions run. */
  const settle = () => new Promise(r => setTimeout(r));

  function createService(initiallyAuthenticated: boolean): NotificationRealtimeService {
    isAuthenticated$ = new BehaviorSubject(initiallyAuthenticated);
    accessToken = 'token';
    startOutcomes = [];
    startDurationMs = 0;
    startsInFlight = 0;
    maxStartsInFlight = 0;
    closeCallbacks = [];

    connection = Object.assign(
      jasmine.createSpyObj<signalR.HubConnection>('HubConnection', ['start', 'stop', 'on', 'onreconnecting', 'onreconnected', 'onclose']),
      { state: signalR.HubConnectionState.Disconnected }
    );

    // Like the real HubConnection: start() is only allowed from Disconnected, and the connection
    // is Connecting until it settles.
    connection.start.and.callFake(async () => {
      if (connection.state !== signalR.HubConnectionState.Disconnected) {
        throw new Error("Cannot start a HubConnection that is not in the 'Disconnected' state.");
      }
      connection.state = signalR.HubConnectionState.Connecting;
      maxStartsInFlight = Math.max(maxStartsInFlight, ++startsInFlight);

      await new Promise(r => startDurationMs ? setTimeout(r, startDurationMs) : r(undefined));
      startsInFlight--;

      if (startOutcomes.shift() === 'fail') {
        connection.state = signalR.HubConnectionState.Disconnected;
        throw new Error('Failed to complete negotiation with the server');
      }
      connection.state = signalR.HubConnectionState.Connected;
    });

    // Like the real HubConnection: stopping an established connection fires onclose.
    connection.stop.and.callFake(async () => {
      connection.state = signalR.HubConnectionState.Disconnected;
      closeCallbacks.forEach(callback => callback());
    });
    connection.onclose.and.callFake(callback => { closeCallbacks.push(callback); });

    buildSpy = spyOn(signalR.HubConnectionBuilder.prototype, 'build').and.returnValue(connection);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { isAuthenticated$, getValidAccessToken: () => Promise.resolve(accessToken) }
        },
      ]
    });

    return TestBed.inject(NotificationRealtimeService);
  }

  /** The connection drops for good, as when automatic reconnect gives up. */
  function connectionLost(): void {
    connection.state = signalR.HubConnectionState.Disconnected;
    closeCallbacks.forEach(callback => callback(new Error('Server timeout elapsed')));
  }

  /** Signs out (which clears any pending retry) and drains the remaining timers. */
  function finish(): void {
    isAuthenticated$.next(false);
    flush();
  }

  it('does not connect before login', async () => {
    createService(false);
    await settle();

    expect(connection.start).not.toHaveBeenCalled();
  });

  it('connects on login and disconnects on logout', async () => {
    createService(false);

    isAuthenticated$.next(true);
    await settle();
    expect(connection.start).toHaveBeenCalledTimes(1);

    isAuthenticated$.next(false);
    await settle();
    expect(connection.stop).toHaveBeenCalledTimes(1);
  });

  it('connects at startup when a session is already stored', async () => {
    createService(true);
    await settle();

    expect(connection.start).toHaveBeenCalledTimes(1);
  });

  it('waits for a pending stop before reconnecting on a quick logout/login', async () => {
    createService(true);
    await settle();

    let finishStop!: () => void;
    connection.stop.and.callFake(() => new Promise<void>(resolve => finishStop = () => {
      connection.state = signalR.HubConnectionState.Disconnected;
      resolve();
    }));
    connection.state = signalR.HubConnectionState.Connected;

    isAuthenticated$.next(false);
    isAuthenticated$.next(true);
    await settle();
    expect(connection.start).toHaveBeenCalledTimes(1); // only the startup connect so far

    finishStop();
    await settle();
    expect(connection.start).toHaveBeenCalledTimes(2);
  });

  describe('connection recovery', () => {
    it('retries a failed first connection and connects once the backend is reachable', fakeAsync(() => {
      createService(false);
      startOutcomes = ['fail', 'fail'];

      isAuthenticated$.next(true);
      tick();
      expect(connection.start).toHaveBeenCalledTimes(1);

      tick(RETRY_INITIAL_DELAY_MS);
      expect(connection.start).toHaveBeenCalledTimes(2);

      tick(RETRY_INITIAL_DELAY_MS * 2);
      expect(connection.start).toHaveBeenCalledTimes(3);
      expect(connection.state).toBe(signalR.HubConnectionState.Connected);

      // Connected: no more attempts.
      tick(RETRY_MAX_DELAY_MS * 4);
      expect(connection.start).toHaveBeenCalledTimes(3);

      finish();
    }));

    it('backs off between attempts up to the cap and keeps retrying while signed in', fakeAsync(() => {
      createService(true);
      startOutcomes = Array(20).fill('fail');
      tick();

      const expectedDelays = [2_000, 4_000, 8_000, 16_000, RETRY_MAX_DELAY_MS, RETRY_MAX_DELAY_MS, RETRY_MAX_DELAY_MS];
      expectedDelays.forEach((delay, i) => {
        tick(delay - 1);
        expect(connection.start).withContext(`before retry ${i + 1}`).toHaveBeenCalledTimes(i + 1);
        tick(1);
        expect(connection.start).withContext(`at retry ${i + 1}`).toHaveBeenCalledTimes(i + 2);
      });

      finish();
    }));

    it('keeps retrying after automatic reconnect gives up, and reconnects', fakeAsync(() => {
      createService(true);
      tick();
      expect(connection.state).toBe(signalR.HubConnectionState.Connected);

      startOutcomes = ['fail', 'fail', 'fail'];
      connectionLost();

      tick(RETRY_INITIAL_DELAY_MS);
      tick(RETRY_INITIAL_DELAY_MS * 2);
      tick(RETRY_INITIAL_DELAY_MS * 4);
      expect(connection.start).toHaveBeenCalledTimes(4);
      expect(connection.state).toBe(signalR.HubConnectionState.Disconnected);

      tick(RETRY_INITIAL_DELAY_MS * 8);
      expect(connection.start).toHaveBeenCalledTimes(5);
      expect(connection.state).toBe(signalR.HubConnectionState.Connected);

      finish();
    }));

    it('stops retrying on logout and makes no attempts while logged out', fakeAsync(() => {
      createService(true);
      startOutcomes = Array(20).fill('fail');
      tick();
      expect(connection.start).toHaveBeenCalledTimes(1);

      isAuthenticated$.next(false);
      tick(RETRY_MAX_DELAY_MS * 10);

      expect(connection.start).toHaveBeenCalledTimes(1);
      flush();
    }));

    it('does not retry when the connection closes because of logout', fakeAsync(() => {
      createService(true);
      tick();
      expect(connection.state).toBe(signalR.HubConnectionState.Connected);

      isAuthenticated$.next(false);
      tick();
      expect(connection.stop).toHaveBeenCalledTimes(1);

      tick(RETRY_MAX_DELAY_MS * 10);
      expect(connection.start).toHaveBeenCalledTimes(1);
      flush();
    }));

    it('starts a fresh connection on login after logout, without a second connection or duplicate handlers', fakeAsync(() => {
      createService(true);
      tick();

      isAuthenticated$.next(false);
      tick();
      isAuthenticated$.next(true);
      tick();

      expect(connection.start).toHaveBeenCalledTimes(2);
      expect(connection.state).toBe(signalR.HubConnectionState.Connected);
      expect(buildSpy).toHaveBeenCalledTimes(1);
      expect(connection.on).toHaveBeenCalledTimes(2);
      expect(connection.on.calls.allArgs().map(args => args[0])).toEqual(['ReceiveReminder', 'ReceiveMention']);

      finish();
    }));

    it('never runs two connection attempts at once when retries overlap a logout/login', fakeAsync(() => {
      createService(true);
      startDurationMs = 1_500;
      startOutcomes = ['fail', 'fail', 'fail', 'fail'];
      tick();

      // First attempt fails at 1.5 s and schedules a retry 2 s later.
      tick(1_500);
      expect(connection.start).toHaveBeenCalledTimes(1);

      // The retry fires and is in flight when a logout and a login arrive, plus the browser
      // coming back online and a repeated sign-in notification.
      tick(RETRY_INITIAL_DELAY_MS);
      expect(startsInFlight).toBe(1);
      isAuthenticated$.next(false);
      isAuthenticated$.next(true);
      window.dispatchEvent(new Event('online'));
      isAuthenticated$.next(true);

      tick(RETRY_MAX_DELAY_MS * 3);

      expect(maxStartsInFlight).toBe(1);
      expect(buildSpy).toHaveBeenCalledTimes(1);
      expect(connection.state).toBe(signalR.HubConnectionState.Connected);

      finish();
    }));

    it('retries immediately when the browser comes back online', fakeAsync(() => {
      createService(true);
      startOutcomes = Array(10).fill('fail');
      tick();
      tick(RETRY_INITIAL_DELAY_MS + RETRY_INITIAL_DELAY_MS * 2); // now waiting 8 s for the third retry
      expect(connection.start).toHaveBeenCalledTimes(3);

      startOutcomes = [];
      window.dispatchEvent(new Event('online'));
      tick();

      expect(connection.start).toHaveBeenCalledTimes(4);
      expect(connection.state).toBe(signalR.HubConnectionState.Connected);
      finish();
    }));

    it('does not attempt or retry without a valid token, and resumes after the session is refreshed', fakeAsync(() => {
      createService(false);
      accessToken = null;

      isAuthenticated$.next(true);
      tick(RETRY_MAX_DELAY_MS * 4);
      expect(connection.start).not.toHaveBeenCalled();

      // A successful refresh re-emits isAuthenticated$ = true.
      accessToken = 'refreshed-token';
      isAuthenticated$.next(true);
      tick();

      expect(connection.start).toHaveBeenCalledTimes(1);
      expect(connection.state).toBe(signalR.HubConnectionState.Connected);
      finish();
    }));
  });
});
