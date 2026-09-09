import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { CalendarComponent } from './calendar.component';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';

describe('CalendarComponent', () => {
  let component: CalendarComponent;
  let fixture: ComponentFixture<CalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

function makeOccurrence(overrides: Partial<CalendarEventUI> = {}): CalendarEventUI {
  return {
    id: 45,
    baseEventId: 45,
    seriesUid: 'series-45',
    occurrenceKey: 'series-45_20260829060000',
    subject: 'Test Rec',
    startDate: new Date('2026-08-29T06:00:00Z'),
    endDate: new Date('2026-08-29T07:00:00Z'),
    isRecurring: true,
    ...overrides
  };
}

/**
 * Regression coverage for the bug reported 2026-08-28: recurring occurrences
 * that were visible right after the initial page load disappeared once the
 * month view loaded more weeks (or any save triggered a refresh). Root
 * cause: CalendarComponent.mergeEvents() deduped by `id`, but every
 * occurrence of a recurring series shares the same `id` — only
 * `occurrenceKey` is unique per occurrence. Reproduced live against the
 * running app (see the plan for this fix) before this fix landed.
 */
describe('CalendarComponent — mergeEvents() occurrence identity', () => {
  let component: CalendarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // A generous range comfortably covering every date used below, matching what a real
  // "re-fetch the currently-loaded month window" call passes to mergeEvents().
  const fullRange = { start: new Date('2026-08-01T00:00:00Z'), end: new Date('2026-10-01T00:00:00Z') };

  it('keeps every occurrence of a recurring series distinct across a merge, even though they share the same id', () => {
    const aug29 = makeOccurrence({ occurrenceKey: 'series-45_20260829060000', startDate: new Date('2026-08-29T06:00:00Z') });
    const sep5 = makeOccurrence({ occurrenceKey: 'series-45_20260905060000', startDate: new Date('2026-09-05T06:00:00Z') });
    const sep12 = makeOccurrence({ occurrenceKey: 'series-45_20260912060000', startDate: new Date('2026-09-12T06:00:00Z') });
    const unrelated = makeOccurrence({ id: 99, baseEventId: 99, seriesUid: 'series-99', occurrenceKey: 'series-99_20260902060000', subject: 'Unrelated event', isRecurring: true });

    (component as any).events = [aug29, sep5, sep12, unrelated];

    // Simulate exactly what a scroll-triggered (or post-save) re-fetch sends:
    // the union range comes back with all same-series occurrences again.
    (component as any).mergeEvents([aug29, sep5, sep12, unrelated], fullRange);

    const testRec = (component as any).events.filter((e: CalendarEventUI) => e.subject === 'Test Rec');
    expect(testRec.length).toBe(3);
    expect(testRec.map((e: CalendarEventUI) => e.occurrenceKey).sort()).toEqual(
      [aug29.occurrenceKey, sep5.occurrenceKey, sep12.occurrenceKey].sort()
    );
  });

  it('still dedupes a true re-fetch of the same occurrence by occurrenceKey (no unbounded growth)', () => {
    const original = makeOccurrence({ subject: 'Original subject' });
    (component as any).events = [original];

    const refetched = makeOccurrence({ subject: 'Renamed subject' }); // same occurrenceKey, updated field
    (component as any).mergeEvents([refetched], fullRange);

    const events = (component as any).events as CalendarEventUI[];
    expect(events.length).toBe(1);
    expect(events[0].subject).toBe('Renamed subject');
  });

  it('falls back to id when occurrenceKey is missing on either side', () => {
    const existing = makeOccurrence({ occurrenceKey: undefined, id: 7, baseEventId: 7 });
    (component as any).events = [existing];

    const refetched = makeOccurrence({ occurrenceKey: undefined, id: 7, baseEventId: 7, subject: 'Updated' });
    (component as any).mergeEvents([refetched], fullRange);

    const events = (component as any).events as CalendarEventUI[];
    expect(events.length).toBe(1);
    expect(events[0].subject).toBe('Updated');
  });
});

/**
 * Regression coverage for the bug reported 2026-09-09: editing (or dragging) a recurring
 * occurrence to a new start date/time made it appear TWICE in month view — once under its
 * stale old position, once under the updated one — until a hard page reload cleared it. Root
 * cause: occurrenceKey is derived from the occurrence's start date/time, so a moved occurrence
 * comes back from the post-save refetch under a brand-new key; mergeEvents()'s key-union never
 * removed the old key, so both survived side by side. Fixed by treating `fetched` as
 * authoritative for the whole requested `range`: any existing occurrence whose ORIGINAL start
 * falls inside `range` but isn't present in the fresh fetch (moved out, or deleted) is now
 * dropped instead of carried forward under its stale key.
 */
describe('CalendarComponent — mergeEvents() drops stale occurrences superseded by a move', () => {
  let component: CalendarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('removes the stale entry when an occurrence moves to a new start date within the refetched range', () => {
    const original = makeOccurrence({
      occurrenceKey: 'series-45_20260829060000',
      startDate: new Date('2026-08-29T06:00:00Z'),
      subject: 'Team sync',
    });
    (component as any).events = [original];

    // The occurrence was edited/dragged to Sep 5 — the refetch for the whole loaded month
    // window comes back with it under a NEW occurrenceKey (derived from the new start date),
    // and no longer contains anything under the OLD key.
    const moved = makeOccurrence({
      occurrenceKey: 'series-45_20260905060000',
      startDate: new Date('2026-09-05T06:00:00Z'),
      subject: 'Team sync',
    });
    const range = { start: new Date('2026-08-01T00:00:00Z'), end: new Date('2026-10-01T00:00:00Z') };

    (component as any).mergeEvents([moved], range);

    const events = (component as any).events as CalendarEventUI[];
    expect(events.length).toBe(1);
    expect(events[0].occurrenceKey).toBe('series-45_20260905060000');
  });

  it('does not drop an occurrence whose original date falls outside the refetched range', () => {
    const outOfRange = makeOccurrence({
      occurrenceKey: 'series-7_20260601060000',
      startDate: new Date('2026-06-01T06:00:00Z'),
      id: 7, baseEventId: 7, seriesUid: 'series-7',
    });
    (component as any).events = [outOfRange];

    // A merge for a September window shouldn't touch an event loaded from a June fetch.
    const septemberRange = { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-10-01T00:00:00Z') };
    (component as any).mergeEvents([], septemberRange);

    const events = (component as any).events as CalendarEventUI[];
    expect(events.length).toBe(1);
    expect(events[0]).toBe(outOfRange);
  });
});

describe('CalendarComponent — findEventByOccurrence()', () => {
  let component: CalendarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('resolves the exact occurrence being dragged/resized, not just the first same-id match', () => {
    const sep5 = makeOccurrence({ occurrenceKey: 'series-45_20260905060000', startDate: new Date('2026-09-05T06:00:00Z') });
    const sep12 = makeOccurrence({ occurrenceKey: 'series-45_20260912060000', startDate: new Date('2026-09-12T06:00:00Z') });
    (component as any).events = [sep5, sep12];

    const resolved = (component as any).findEventByOccurrence({ id: 45, occurrenceKey: 'series-45_20260912060000' });

    expect(resolved).toBe(sep12);
  });

  it('falls back to id-only matching when the target has no occurrenceKey', () => {
    const only = makeOccurrence({ id: 8, baseEventId: 8, occurrenceKey: 'series-8_x' });
    (component as any).events = [only];

    const resolved = (component as any).findEventByOccurrence({ id: 8 });

    expect(resolved).toBe(only);
  });
});

/**
 * Regression coverage for the bug reported 2026-08-29: after saving an
 * occurrence edit, the calendar showed no loading feedback while the
 * background refresh was still in flight, and clicking the just-edited
 * event again during that window opened it with stale (pre-save) data.
 * Root cause: refreshAfterSave()'s month-view branch fetched and merged
 * independently of the existing needMoreRange$ pipeline, so it never drove
 * `isLoading` (the flag already wired to the loading overlay + a
 * pointer-events:none grid) and could also race a concurrent
 * scroll-triggered refresh. Fixed by routing it through the same
 * needMoreRange$ -> switchMap pipeline instead of duplicating the fetch.
 */
describe('CalendarComponent — refreshAfterSave() loading state and race safety', () => {
  let component: CalendarComponent;
  let fixture: ComponentFixture<CalendarComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // Flush whatever the initial ngOnInit load triggered, so monthScrollWindow
    // exists and no requests are left outstanding before each test begins.
    httpMock.match(req => req.url.includes('/Calendar/events')).forEach(req => req.flush([]));
  });

  afterEach(() => httpMock.verify());

  it('sets isLoading synchronously when triggered, and clears it once the response settles', () => {
    expect(component.isLoading).toBeFalse();

    (component as any).refreshAfterSave();

    // True immediately — before the HTTP response has arrived. This is the
    // exact window the bug lived in: the dialog had already closed and the
    // grid was fully interactive with stale data during this gap.
    expect(component.isLoading).toBeTrue();

    const req = httpMock.expectOne(r => r.url.includes('/Calendar/events'));
    req.flush([]);

    expect(component.isLoading).toBeFalse();
  });

  it('clears isLoading even when the refresh request errors', () => {
    (component as any).refreshAfterSave();
    expect(component.isLoading).toBeTrue();

    const req = httpMock.expectOne(r => r.url.includes('/Calendar/events'));
    req.flush('error', { status: 500, statusText: 'Server Error' });

    expect(component.isLoading).toBeFalse();
  });

  it('a save-triggered refresh and a scroll-triggered refresh cannot race: switchMap cancels the older one', () => {
    // First trigger (e.g. a save-triggered refresh)...
    (component as any).refreshAfterSave();
    // ...then immediately a second trigger (e.g. the user scrolls right
    // after saving) before the first has resolved. Both go through the same
    // needMoreRange$ -> switchMap pipeline, so the second must tear down the
    // first's still-pending subscription rather than letting both resolve
    // independently and race to be the last one to call mergeEvents(). The
    // range must genuinely extend past what's already fetched, or
    // onNeedMoreMonthEvents() no-ops (needsFetch stays false).
    const extendedEnd = new Date((component as any).monthFetchedEnd.getTime() + 24 * 60 * 60 * 1000);
    (component as any).onNeedMoreMonthEvents({
      start: (component as any).monthFetchedStart,
      end: extendedEnd,
    });

    const [older, newer] = httpMock.match(r => r.url.includes('/Calendar/events'));
    expect(older.cancelled).toBeTrue();
    expect(newer.cancelled).toBeFalsy();

    const freshEvent = makeOccurrence({ subject: 'FRESH - the surviving response' });
    newer.flush([freshEvent]);

    const subjects = (component as any).events.map((e: CalendarEventUI) => e.subject);
    expect(subjects).toEqual(['FRESH - the surviving response']);
    expect(component.isLoading).toBeFalse();
  });
});
