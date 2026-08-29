import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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

  it('keeps every occurrence of a recurring series distinct across a merge, even though they share the same id', () => {
    const aug29 = makeOccurrence({ occurrenceKey: 'series-45_20260829060000', startDate: new Date('2026-08-29T06:00:00Z') });
    const sep5 = makeOccurrence({ occurrenceKey: 'series-45_20260905060000', startDate: new Date('2026-09-05T06:00:00Z') });
    const sep12 = makeOccurrence({ occurrenceKey: 'series-45_20260912060000', startDate: new Date('2026-09-12T06:00:00Z') });
    const unrelated = makeOccurrence({ id: 99, baseEventId: 99, seriesUid: 'series-99', occurrenceKey: 'series-99_20260902060000', subject: 'Unrelated event', isRecurring: true });

    (component as any).events = [aug29, sep5, sep12, unrelated];

    // Simulate exactly what a scroll-triggered (or post-save) re-fetch sends:
    // the union range comes back with all same-series occurrences again.
    (component as any).mergeEvents([aug29, sep5, sep12, unrelated]);

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
    (component as any).mergeEvents([refetched]);

    const events = (component as any).events as CalendarEventUI[];
    expect(events.length).toBe(1);
    expect(events[0].subject).toBe('Renamed subject');
  });

  it('falls back to id when occurrenceKey is missing on either side', () => {
    const existing = makeOccurrence({ occurrenceKey: undefined, id: 7, baseEventId: 7 });
    (component as any).events = [existing];

    const refetched = makeOccurrence({ occurrenceKey: undefined, id: 7, baseEventId: 7, subject: 'Updated' });
    (component as any).mergeEvents([refetched]);

    const events = (component as any).events as CalendarEventUI[];
    expect(events.length).toBe(1);
    expect(events[0].subject).toBe('Updated');
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
