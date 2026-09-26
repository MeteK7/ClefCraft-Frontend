import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import * as signalR from '@microsoft/signalr';

import { NotificationRealtimeService } from './notification-realtime.service';
import { AuthService } from './auth.service';

describe('NotificationRealtimeService', () => {
  let isAuthenticated$: BehaviorSubject<boolean>;
  let connection: jasmine.SpyObj<signalR.HubConnection> & { state: signalR.HubConnectionState };

  /** Lets the queued start/stop transitions run. */
  const settle = () => new Promise(r => setTimeout(r));

  function createService(initiallyAuthenticated: boolean): NotificationRealtimeService {
    isAuthenticated$ = new BehaviorSubject(initiallyAuthenticated);

    connection = Object.assign(
      jasmine.createSpyObj<signalR.HubConnection>('HubConnection', ['start', 'stop', 'on', 'onreconnecting', 'onreconnected', 'onclose']),
      { state: signalR.HubConnectionState.Disconnected }
    );
    connection.start.and.callFake(async () => { connection.state = signalR.HubConnectionState.Connected; });
    connection.stop.and.callFake(async () => { connection.state = signalR.HubConnectionState.Disconnected; });
    spyOn(signalR.HubConnectionBuilder.prototype, 'build').and.returnValue(connection);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isAuthenticated$, getValidAccessToken: () => Promise.resolve('token') } },
      ]
    });

    return TestBed.inject(NotificationRealtimeService);
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
});
