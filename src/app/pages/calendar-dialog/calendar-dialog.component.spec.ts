import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { CalendarDialogComponent } from './calendar-dialog.component';
import { RecurrenceScopeDialogComponent } from '../recurrence-scope-dialog/recurrence-scope-dialog.component';
import { RecurrenceDeleteScopeDialogComponent } from '../recurrence-delete-scope-dialog/recurrence-delete-scope-dialog.component';
import { AuthService } from '../../_services/auth.service';

describe('CalendarDialogComponent', () => {
  let component: CalendarDialogComponent;
  let fixture: ComponentFixture<CalendarDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { eventData: null, date: new Date() } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CalendarDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/**
 * Builds a fresh testing module with the given MAT_DIALOG_DATA. Used instead
 * of the single shared beforeEach above so each test can exercise a
 * different edit-mode / new-event scenario from the recurrence
 * state-transition matrix.
 */
async function createDialog(data: any): Promise<{
  fixture: ComponentFixture<CalendarDialogComponent>;
  component: CalendarDialogComponent;
  dialog: MatDialog;
}> {
  TestBed.resetTestingModule();

  await TestBed.configureTestingModule({
    imports: [CalendarDialogComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      { provide: MAT_DIALOG_DATA, useValue: data }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(CalendarDialogComponent);
  const component = fixture.componentInstance;
  // Grab the exact MatDialog instance the component itself holds (rather
  // than a separate TestBed.inject(MatDialog) call) so spying on it is
  // guaranteed to intercept the component's own this.dialog.open(...) call.
  const dialog: MatDialog = (component as any).dialog;
  fixture.detectChanges();

  return { fixture, component, dialog };
}

/**
 * Same as createDialog(), but also stubs AuthService.getUserId() so
 * isEventOwner (which compares it against eventData.ownerUserId) can be
 * driven deterministically — the real AuthService reads from a JWT that
 * doesn't exist in a test environment, so it would otherwise always
 * resolve to a non-owner.
 */
async function createDialogAsUser(data: any, currentUserId: string | null): Promise<{
  fixture: ComponentFixture<CalendarDialogComponent>;
  component: CalendarDialogComponent;
  dialog: MatDialog;
}> {
  TestBed.resetTestingModule();

  // getCurrentUser is also stubbed (not just getUserId) because the dialog's Comments tab
  // renders a nested CommentThreadComponent that calls it directly.
  const authServiceSpy = jasmine.createSpyObj('AuthService', ['getUserId', 'getCurrentUser']);
  authServiceSpy.getUserId.and.returnValue(currentUserId);
  authServiceSpy.getCurrentUser.and.returnValue({ fullName: 'Test User' } as any);

  await TestBed.configureTestingModule({
    imports: [CalendarDialogComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: AuthService, useValue: authServiceSpy }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(CalendarDialogComponent);
  const component = fixture.componentInstance;
  const dialog: MatDialog = (component as any).dialog;
  fixture.detectChanges();

  return { fixture, component, dialog };
}

function baseEventData(overrides: Partial<any> = {}): any {
  const start = new Date('2026-03-02T09:00:00');
  const end = new Date('2026-03-02T10:00:00');

  return {
    id: 42,
    baseEventId: 42,
    seriesUid: 'series-1',
    subject: 'Standup',
    startDate: start,
    endDate: end,
    allDayEvent: false,
    isRecurring: false,
    recurrenceRuleJson: null,
    ...overrides
  };
}

describe('CalendarDialogComponent — recurrence state-transition matrix', () => {
  // Matrix row A: brand-new, non-recurring event never opens the scope dialog.
  it('row A — new non-recurring event: no scope dialog, plain save payload', async () => {
    const { component, dialog } = await createDialog({ eventData: null, date: new Date('2026-03-02') });
    spyOn(dialog, 'open');
    component.generalForm.patchValue({ subject: 'New event' });

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));

    component.handleSave();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(emitted.recurrenceScope).toBeNull();
    expect(emitted.id).toBeNull();
  });

  // Matrix row B: brand-new recurring event never opens the scope dialog either.
  it('row B — new recurring event: no scope dialog, rule included in payload', async () => {
    const { component, dialog } = await createDialog({ eventData: null, date: new Date('2026-03-02') });
    spyOn(dialog, 'open');
    component.generalForm.patchValue({
      subject: 'New recurring event',
      isRecurring: true,
      frequency: 'WEEKLY',
      interval: 1
    });

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));

    component.handleSave();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(emitted.recurrenceScope).toBeNull();
    expect(JSON.parse(emitted.recurrenceRuleJson).Frequency).toBe('WEEKLY');
  });

  // Matrix row C: editing a plain event that stays plain — no scope dialog.
  it('row C — non-recurring to non-recurring edit: no scope dialog', async () => {
    const { component, dialog } = await createDialog({ eventData: baseEventData({ isRecurring: false }) });
    spyOn(dialog, 'open');

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));

    component.handleSave();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(emitted.recurrenceScope).toBeNull();
    expect(emitted.recurrenceRuleJson).toBeNull();
  });

  // Matrix row D: turning recurrence ON for a previously plain event must
  // NOT open the "which occurrences" scope dialog — this was the root cause
  // of the reported "add recurrence doesn't save correctly" bug.
  it('row D — non-recurring to recurring: no scope dialog, routes to plain save', async () => {
    const { component, dialog } = await createDialog({ eventData: baseEventData({ isRecurring: false }) });
    spyOn(dialog, 'open');
    component.generalForm.patchValue({ isRecurring: true, frequency: 'WEEKLY', interval: 1 });

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));

    component.handleSave();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(emitted.recurrenceScope).toBeNull();
    expect(emitted.isRecurring).toBeTrue();
    expect(emitted.recurrenceRuleJson).not.toBeNull();
  });

  // Matrix row I: turning recurrence OFF for a previously recurring event
  // must also skip the scope dialog — there is no "which occurrences" to
  // choose when removing recurrence entirely.
  it('row I — recurring to non-recurring: no scope dialog, routes to plain save', async () => {
    const eventData = baseEventData({
      isRecurring: true,
      recurrenceRuleJson: JSON.stringify({ Frequency: 'WEEKLY', Interval: 1, DaysOfWeek: [1], EndDate: null, Count: null })
    });
    const { component, dialog } = await createDialog({ eventData });
    spyOn(dialog, 'open');
    component.generalForm.patchValue({ isRecurring: false });

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));

    component.handleSave();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(emitted.recurrenceScope).toBeNull();
    expect(emitted.isRecurring).toBeFalse();
    expect(emitted.recurrenceRuleJson).toBeNull();
  });

  // Matrix rows E-H: an edit that stays within an existing recurring series
  // is the only case that should open the scope dialog.
  it('rows E-H — recurring stays recurring: opens the scope dialog and forwards the chosen scope', async () => {
    const eventData = baseEventData({
      isRecurring: true,
      recurrenceRuleJson: JSON.stringify({ Frequency: 'WEEKLY', Interval: 1, DaysOfWeek: [1], EndDate: null, Count: null })
    });
    const { component, dialog } = await createDialog({ eventData });
    spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of('allOverride') } as any);
    component.generalForm.patchValue({ subject: 'Renamed standup' }); // still recurring, unrelated field edit

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));

    component.handleSave();

    expect(dialog.open).toHaveBeenCalledWith(RecurrenceScopeDialogComponent, jasmine.any(Object));
    expect(emitted.recurrenceScope).toBe('allOverride');
  });

  it('scope dialog cancelled (null result) does not emit onSave', async () => {
    const eventData = baseEventData({
      isRecurring: true,
      recurrenceRuleJson: JSON.stringify({ Frequency: 'WEEKLY', Interval: 1 })
    });
    const { component, dialog } = await createDialog({ eventData });
    spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of(null) } as any);

    let emitted: any = 'not-called';
    component.onSave.subscribe(({ record }) => (emitted = record));

    component.handleSave();

    expect(emitted).toBe('not-called');
  });
});

describe('CalendarDialogComponent — edit-mode recurrence rule deserialization', () => {
  it('populates frequency/interval/daysOfWeek/endType("until") from a persisted rule with EndDate', async () => {
    const rule = { Frequency: 'MONTHLY', Interval: 3, DaysOfWeek: [2, 4], EndDate: '2026-06-01T00:00:00Z', Count: null };
    const eventData = baseEventData({ isRecurring: true, recurrenceRuleJson: JSON.stringify(rule) });

    const { component } = await createDialog({ eventData });

    expect(component.generalForm.value.frequency).toBe('MONTHLY');
    expect(component.generalForm.value.interval).toBe(3);
    expect(component.generalForm.value.daysOfWeek).toEqual([2, 4]);
    expect(component.generalForm.value.endType).toBe('until');
    expect(new Date(component.generalForm.value.recurrenceEndDate).toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(component.generalForm.value.recurrenceCount).toBeNull();
  });

  it('derives endType("count") from a persisted rule with Count', async () => {
    const rule = { Frequency: 'DAILY', Interval: 1, DaysOfWeek: null, EndDate: null, Count: 8 };
    const eventData = baseEventData({ isRecurring: true, recurrenceRuleJson: JSON.stringify(rule) });

    const { component } = await createDialog({ eventData });

    expect(component.generalForm.value.endType).toBe('count');
    expect(component.generalForm.value.recurrenceCount).toBe(8);
    expect(component.generalForm.value.recurrenceEndDate).toBeNull();
  });

  it('derives endType("never") when neither EndDate nor Count is set', async () => {
    const rule = { Frequency: 'WEEKLY', Interval: 1, DaysOfWeek: [1, 3], EndDate: null, Count: null };
    const eventData = baseEventData({ isRecurring: true, recurrenceRuleJson: JSON.stringify(rule) });

    const { component } = await createDialog({ eventData });

    expect(component.generalForm.value.endType).toBe('never');
  });

  it('a no-op subject edit on a recurring event preserves the original rule when saved with scope', async () => {
    // Regression guard for the audit's most severe finding: without
    // deserialization, saving "apply to all" after an unrelated field edit
    // silently reset the series rule to form defaults.
    const rule = { Frequency: 'MONTHLY', Interval: 2, DaysOfWeek: null, EndDate: null, Count: 5 };
    const eventData = baseEventData({ isRecurring: true, recurrenceRuleJson: JSON.stringify(rule) });
    const { component, dialog } = await createDialog({ eventData });
    spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of('allOverride') } as any);

    component.generalForm.patchValue({ subject: 'Renamed only' });

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));
    component.handleSave();

    const savedRule = JSON.parse(emitted.recurrenceRuleJson);
    expect(savedRule.Frequency).toBe('MONTHLY');
    expect(savedRule.Interval).toBe(2);
    expect(savedRule.Count).toBe(5);
  });
});

describe('CalendarDialogComponent — end-condition (endType) handling', () => {
  it('switching endType away from "until" clears recurrenceEndDate', async () => {
    const { component } = await createDialog({ eventData: null, date: new Date('2026-03-02') });

    component.generalForm.patchValue({ endType: 'until', recurrenceEndDate: new Date('2026-06-01') });
    expect(component.generalForm.value.recurrenceEndDate).not.toBeNull();

    component.generalForm.patchValue({ endType: 'never' });
    expect(component.generalForm.value.recurrenceEndDate).toBeNull();
  });

  it('switching endType away from "count" clears recurrenceCount', async () => {
    const { component } = await createDialog({ eventData: null, date: new Date('2026-03-02') });

    component.generalForm.patchValue({ endType: 'count', recurrenceCount: 10 });
    expect(component.generalForm.value.recurrenceCount).not.toBeNull();

    component.generalForm.patchValue({ endType: 'until' });
    expect(component.generalForm.value.recurrenceCount).toBeNull();
  });

  it('executeSave only includes the field matching the selected endType', async () => {
    const { component, dialog } = await createDialog({ eventData: null, date: new Date('2026-03-02') });
    spyOn(dialog, 'open');
    component.generalForm.patchValue({
      subject: 'Weekly thing',
      isRecurring: true,
      frequency: 'WEEKLY',
      interval: 1,
      endType: 'count',
      recurrenceCount: 6,
      recurrenceEndDate: new Date('2026-12-25') // stale leftover from a prior selection
    });

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));
    component.handleSave();

    const savedRule = JSON.parse(emitted.recurrenceRuleJson);
    expect(savedRule.Count).toBe(6);
    expect(savedRule.EndDate).toBeNull();
  });

  it('pushes the "until" end date to the last instant of that local day, not local midnight', async () => {
    // Regression guard for the bug found 2026-08-28: a bare local-midnight
    // EndDate serializes to a UTC instant that can land *before* that same
    // calendar day's occurrence time in timezones ahead of UTC, silently
    // excluding the very day the user picked as the series' last one.
    const { component, dialog } = await createDialog({ eventData: null, date: new Date('2026-03-02') });
    spyOn(dialog, 'open');
    component.generalForm.patchValue({
      subject: 'Saturday thing',
      isRecurring: true,
      frequency: 'WEEKLY',
      interval: 1,
      endType: 'until',
      recurrenceEndDate: new Date(2026, 8, 19) // local midnight, Sep 19 2026
    });

    let emitted: any;
    component.onSave.subscribe(({ record }) => (emitted = record));
    component.handleSave();

    const savedRule = JSON.parse(emitted.recurrenceRuleJson);
    const sentEndDate = new Date(savedRule.EndDate);
    expect(sentEndDate.getFullYear()).toBe(2026);
    expect(sentEndDate.getMonth()).toBe(8); // September
    expect(sentEndDate.getDate()).toBe(19);
    expect(sentEndDate.getHours()).toBe(23);
    expect(sentEndDate.getMinutes()).toBe(59);
    expect(sentEndDate.getSeconds()).toBe(59);
  });
});

describe('CalendarDialogComponent — quickEnableRecurrence()', () => {
  it('resets interval/daysOfWeek/endType/end-condition values even if a custom rule was configured first', async () => {
    const { component } = await createDialog({ eventData: null, date: new Date('2026-03-02') });

    component.generalForm.patchValue({
      interval: 5,
      daysOfWeek: [1, 2, 3],
      endType: 'until',
      recurrenceEndDate: new Date('2026-06-01'),
      recurrenceCount: 9
    });

    component.quickEnableRecurrence('DAILY');

    expect(component.generalForm.value.isRecurring).toBeTrue();
    expect(component.generalForm.value.frequency).toBe('DAILY');
    expect(component.generalForm.value.interval).toBe(1);
    expect(component.generalForm.value.daysOfWeek).toEqual([]);
    expect(component.generalForm.value.endType).toBe('never');
    expect(component.generalForm.value.recurrenceEndDate).toBeNull();
    expect(component.generalForm.value.recurrenceCount).toBeNull();
  });
});

describe('CalendarDialogComponent — originalOccurrenceDate capture', () => {
  it('captures the occurrence date for a recurring event, including its first occurrence (id === baseEventId)', async () => {
    const eventData = baseEventData({
      id: 42,
      baseEventId: 42, // first occurrence: the old id !== baseEventId check always excluded this case
      isRecurring: true,
      recurrenceRuleJson: JSON.stringify({ Frequency: 'WEEKLY', Interval: 1 })
    });

    const { component } = await createDialog({ eventData });

    expect(component.originalOccurrenceDate).not.toBeNull();
    expect(new Date(component.originalOccurrenceDate!).getTime()).toBe(new Date(eventData.startDate).getTime());
  });

  it('does not capture an occurrence date for a non-recurring event', async () => {
    const eventData = baseEventData({ isRecurring: false });

    const { component } = await createDialog({ eventData });

    expect(component.originalOccurrenceDate).toBeNull();
  });
});

describe('CalendarDialogComponent — Delete button visibility', () => {
  it('is hidden when creating a brand-new event (no eventId)', async () => {
    const { component } = await createDialogAsUser({ eventData: null, date: new Date('2026-03-02') }, 'user-1');

    expect(component.eventId).toBeNull();
  });

  it('is shown when editing an event owned by the current user', async () => {
    const eventData = baseEventData({ ownerUserId: 'user-1', isRecurring: false });
    const { component } = await createDialogAsUser({ eventData }, 'user-1');

    expect(component.eventId).toBe(42);
    expect(component.isEventOwner).toBeTrue();
  });

  it('is hidden when editing an event owned by someone else (read-only collaborator)', async () => {
    const eventData = baseEventData({ ownerUserId: 'someone-else', isRecurring: false });
    const { component } = await createDialogAsUser({ eventData }, 'user-1');

    expect(component.eventId).toBe(42);
    expect(component.isEventOwner).toBeFalse();
  });
});

describe('CalendarDialogComponent — handleDelete()', () => {
  it('non-recurring event: confirmed — emits onDelete with the event id, no scope dialog', async () => {
    const eventData = baseEventData({ ownerUserId: 'user-1', isRecurring: false });
    const { component, dialog } = await createDialogAsUser({ eventData }, 'user-1');
    spyOn(dialog, 'open');
    spyOn(window, 'confirm').and.returnValue(true);

    let emitted: any = null;
    component.onDelete.subscribe(payload => (emitted = payload));

    component.handleDelete();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(emitted).toEqual({ id: 42 });
    expect(component.saving).toBeTrue();
  });

  it('non-recurring event: declined — emits nothing', async () => {
    const eventData = baseEventData({ ownerUserId: 'user-1', isRecurring: false });
    const { component } = await createDialogAsUser({ eventData }, 'user-1');
    spyOn(window, 'confirm').and.returnValue(false);

    let emitted: any = null;
    component.onDelete.subscribe(payload => (emitted = payload));

    component.handleDelete();

    expect(emitted).toBeNull();
    expect(component.saving).toBeFalse();
  });

  it('recurring event: opens the delete-scope dialog and emits onDelete with the chosen scope', async () => {
    const eventData = baseEventData({
      ownerUserId: 'user-1',
      isRecurring: true,
      recurrenceRuleJson: JSON.stringify({ Frequency: 'DAILY', Interval: 1 })
    });
    const { component, dialog } = await createDialogAsUser({ eventData }, 'user-1');
    spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of('thisAndFollowing') } as any);

    let emitted: any = null;
    component.onDelete.subscribe(payload => (emitted = payload));

    component.handleDelete();

    expect(dialog.open).toHaveBeenCalledWith(RecurrenceDeleteScopeDialogComponent, jasmine.any(Object));
    expect(emitted).toEqual(jasmine.objectContaining({ seriesUid: 'series-1', scope: 'thisAndFollowing' }));
  });

  it('recurring event: cancelling the scope dialog emits nothing and resets saving', async () => {
    const eventData = baseEventData({
      ownerUserId: 'user-1',
      isRecurring: true,
      recurrenceRuleJson: JSON.stringify({ Frequency: 'DAILY', Interval: 1 })
    });
    const { component, dialog } = await createDialogAsUser({ eventData }, 'user-1');
    spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of(null) } as any);

    let emitted: any = null;
    component.onDelete.subscribe(payload => (emitted = payload));

    component.handleDelete();

    expect(emitted).toBeNull();
    expect(component.saving).toBeFalse();
  });
});
