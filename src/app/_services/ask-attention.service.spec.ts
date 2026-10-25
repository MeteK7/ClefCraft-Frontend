import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { ATTENTION_REFRESH_DEBOUNCE_MS, AskAttentionService } from './ask-attention.service';
import { AuthService } from './auth.service';
import { BoardItemAskService } from './board-item-ask.service';
import { AskEventPayload, NotificationRealtimeService } from './notification-realtime.service';

describe('AskAttentionService', () => {
  let service: AskAttentionService;
  let isAuthenticated$: BehaviorSubject<boolean>;
  let askEvents$: Subject<AskEventPayload>;
  let connected$: Subject<void>;
  let countMine: jasmine.Spy;

  function setup(signedIn: boolean, counts: number[] = [3]): void {
    isAuthenticated$ = new BehaviorSubject(signedIn);
    askEvents$ = new Subject();
    connected$ = new Subject();
    let call = 0;
    countMine = jasmine.createSpy('countMine').and.callFake(() => of(counts[Math.min(call++, counts.length - 1)]));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isAuthenticated$ } },
        { provide: NotificationRealtimeService, useValue: { askEvents$, connected$ } },
        { provide: BoardItemAskService, useValue: { countMine } }
      ]
    });
    service = TestBed.inject(AskAttentionService);
  }

  afterEach(() => service.ngOnDestroy());

  const settle = () => tick(ATTENTION_REFRESH_DEBOUNCE_MS);
  const event = { askId: 1 } as AskEventPayload;

  it('counts the asks that are your move once you are signed in', fakeAsync(() => {
    setup(true, [3]);
    expect(service.count()).toBeNull();

    settle();

    expect(countMine).toHaveBeenCalledOnceWith('waiting');
    expect(service.count()).toBe(3);
  }));

  it('asks nothing while signed out, and forgets the count on sign-out', fakeAsync(() => {
    setup(false);
    service.refresh();
    askEvents$.next(event);
    settle();
    expect(countMine).not.toHaveBeenCalled();
    expect(service.count()).toBeNull();

    isAuthenticated$.next(true);
    settle();
    expect(service.count()).toBe(3);

    isAuthenticated$.next(false);
    expect(service.count()).toBeNull();
  }));

  it('recounts after an ask event, a reconnect, or coming back to the window, gathering bursts', fakeAsync(() => {
    setup(true, [1, 2, 3, 4]);
    settle();
    expect(service.count()).toBe(1);

    askEvents$.next(event);
    askEvents$.next(event);
    service.refresh();
    settle();
    expect(countMine).toHaveBeenCalledTimes(2);
    expect(service.count()).toBe(2);

    connected$.next();
    settle();
    expect(service.count()).toBe(3);

    window.dispatchEvent(new Event('focus'));
    settle();
    expect(service.count()).toBe(4);
  }));

  it('keeps the last count when counting fails', fakeAsync(() => {
    setup(true, [5]);
    settle();

    countMine.and.returnValue(throwError(() => new Error('offline')));
    service.refresh();
    settle();

    expect(service.count()).toBe(5);
  }));
});
