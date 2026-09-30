import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { MentionPayload, NotificationRealtimeService, ReminderPayload } from './_services/notification-realtime.service';
import { LiveReminderToastComponent } from './pages/live-reminder-toast/live-reminder-toast.component';
import { MentionToastComponent } from './pages/mention-toast/mention-toast.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
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
  let snackBar: jasmine.SpyObj<MatSnackBar>;
  let action$: Subject<void>;
  let router: Router;

  beforeEach(async () => {
    reminders$ = new Subject<ReminderPayload>();
    mentions$ = new Subject<MentionPayload>();
    action$ = new Subject<void>();
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['openFromComponent', 'open']);
    snackBar.openFromComponent.and.returnValue({ onAction: () => action$.asObservable() } as any);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: NotificationRealtimeService, useValue: { reminders$, mentions$ } },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    TestBed.createComponent(AppComponent).detectChanges();
  });

  it('shows a reminder whatever page is open', () => {
    reminders$.next({ eventId: 62, message: 'Lesson starts in 10 minutes' });

    expect(snackBar.openFromComponent).toHaveBeenCalledOnceWith(
      LiveReminderToastComponent,
      jasmine.objectContaining({ data: { message: 'Lesson starts in 10 minutes', eventId: 62 } }));
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
