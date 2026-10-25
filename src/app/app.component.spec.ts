import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { AskEventPayload, MentionPayload, NotificationRealtimeService, ReminderPayload } from './_services/notification-realtime.service';
import { OpenAskItemsService } from './_services/open-ask-items.service';
import { LiveReminderToastComponent } from './pages/live-reminder-toast/live-reminder-toast.component';
import { MentionToastComponent } from './pages/mention-toast/mention-toast.component';
import { AskToastComponent } from './pages/ask-toast/ask-toast.component';
import { AskGroupToastComponent } from './pages/ask-toast/ask-group-toast.component';
import { AskToastCoordinator } from './_services/ask-toast-coordinator.service';
import { AskAttentionService } from './_services/ask-attention.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'Activity Management' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('Activity Management');
  });

  it('renders the app shell (header, sidebar, router outlet, footer)', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-header')).toBeTruthy();
    expect(compiled.querySelector('app-sidebar')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
    expect(compiled.querySelector('app-footer')).toBeTruthy();
  });
});

describe('AppComponent — realtime toasts on every page', () => {
  let reminders$: Subject<ReminderPayload>;
  let mentions$: Subject<MentionPayload>;
  let askEvents$: Subject<AskEventPayload>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;
  let action$: Subject<void>;
  let router: Router;
  // The coordinator (timing, tabs, typing) has its own spec; here every offer comes straight out.
  let batches$: Subject<AskEventPayload[]>;
  let offered: AskEventPayload[];

  beforeEach(async () => {
    reminders$ = new Subject<ReminderPayload>();
    mentions$ = new Subject<MentionPayload>();
    askEvents$ = new Subject<AskEventPayload>();
    action$ = new Subject<void>();
    batches$ = new Subject<AskEventPayload[]>();
    offered = [];
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['openFromComponent', 'open']);
    snackBar.openFromComponent.and.returnValue({ onAction: () => action$.asObservable() } as any);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: NotificationRealtimeService, useValue: { reminders$, mentions$, askEvents$, connected$: new Subject<void>() } },
        { provide: MatSnackBar, useValue: snackBar },
        {
          provide: AskToastCoordinator,
          useValue: { batches$, offer: (event: AskEventPayload) => { offered.push(event); batches$.next([event]); } }
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    TestBed.createComponent(AppComponent).detectChanges();
  });

  const askEvent = (overrides: Partial<AskEventPayload> = {}): AskEventPayload => ({
    askId: 7, boardItemId: 1, boardId: 3, itemTitle: 'Implement RAG pipeline', event: 'Replied',
    actorFullName: 'Ayse Recipient', note: 'Share the SQL', reason: null, actedOnBehalf: false,
    replyId: 40, replyExcerpt: 'INSERT INTO items', occurredAt: '2026-10-25T10:00:00Z', ...overrides
  });

  it('shows an ask event as a toast that opens the ask on its board', () => {
    askEvents$.next(askEvent());

    expect(snackBar.openFromComponent).toHaveBeenCalledOnceWith(
      AskToastComponent, jasmine.objectContaining({ data: askEvent() }));

    action$.next();
    expect(router.navigate).toHaveBeenCalledWith(['/board'], { queryParams: { openItemId: 1, boardId: 3, askId: 7 } });
  });

  it('opens just the item for a cancelled ask, which has nothing left to act on', () => {
    askEvents$.next(askEvent({ event: 'Cancelled', reason: 'Withdrawn' }));

    action$.next();
    expect(router.navigate).toHaveBeenCalledWith(['/board'], { queryParams: { openItemId: 1, boardId: 3 } });
  });

  it('leaves an ask event for an item whose asks are on screen to that panel, without a toast', () => {
    const openItems = TestBed.inject(OpenAskItemsService);
    openItems.register(1);

    askEvents$.next(askEvent());
    expect(snackBar.openFromComponent).not.toHaveBeenCalled();

    openItems.unregister(1);
    askEvents$.next(askEvent());
    expect(snackBar.openFromComponent).toHaveBeenCalledTimes(1);
    expect(offered.length).toBe(1);
  });

  it('shows several events that arrived together as one toast, whose action opens Waiting for you', () => {
    const openTray = spyOn(TestBed.inject(AskAttentionService), 'openTray');
    const events = [askEvent(), askEvent({ askId: 8, boardItemId: 2, itemTitle: 'Release notes', event: 'Requested' })];

    batches$.next(events);

    expect(snackBar.openFromComponent).toHaveBeenCalledOnceWith(
      AskGroupToastComponent, jasmine.objectContaining({ data: events }));
    action$.next();
    expect(openTray).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('leaves out of a waiting batch an item the user opened meanwhile', () => {
    TestBed.inject(OpenAskItemsService).register(1);

    batches$.next([askEvent(), askEvent({ askId: 8, boardItemId: 2, itemTitle: 'Release notes' })]);

    expect(snackBar.openFromComponent).toHaveBeenCalledOnceWith(
      AskToastComponent, jasmine.objectContaining({ data: jasmine.objectContaining({ askId: 8 }) }));
  });

  it('shows a reminder whatever page is open', () => {
    reminders$.next({ eventId: 62, message: 'Lesson starts in 10 minutes' });

    expect(snackBar.openFromComponent).toHaveBeenCalledOnceWith(
      LiveReminderToastComponent,
      jasmine.objectContaining({ data: { message: 'Lesson starts in 10 minutes', eventId: 62 } }));
  });

  it('leaves the reminder toast to time its own dismissal, so hovering can pause it', () => {
    reminders$.next({ eventId: 62, message: 'Lesson starts in 10 minutes' });

    const config = snackBar.openFromComponent.calls.mostRecent().args[1];
    expect(config?.duration).toBeUndefined();
  });

  it('opens the event on the calendar from "View event"', () => {
    reminders$.next({ eventId: 62, message: 'Lesson starts in 10 minutes' });

    action$.next();

    expect(router.navigate).toHaveBeenCalledWith(['/calendar'], { queryParams: { eventId: 62 } });
  });

  it('still shows mentions', () => {
    mentions$.next({
      entityType: 'CalendarEvent', entityId: 5, commentId: 9, authorFullName: 'Jane Doe',
      excerpt: 'hi', boardId: null, grantedAccess: false
    });

    expect(snackBar.openFromComponent).toHaveBeenCalledOnceWith(MentionToastComponent, jasmine.any(Object));
  });
});
