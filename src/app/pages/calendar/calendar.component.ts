import { Component, OnInit, OnDestroy, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize, map, Observable, Subject, Subscription, switchMap, tap } from 'rxjs';

import { CalendarDialogComponent } from '../calendar-dialog/calendar-dialog.component';
import { LiveReminderToastComponent } from '../live-reminder-toast/live-reminder-toast.component';
import { RecurrenceScopeDialogComponent } from '../recurrence-scope-dialog/recurrence-scope-dialog.component';
import { RecurrenceUpdateScope } from '../../models/recurrence-update-scope.model';

import { CalendarService } from '../../_services/calendar.service';
import { NotificationRealtimeService } from '../../_services/notification-realtime.service';
import { AuthService } from '../../_services/auth.service';
import { CalendarEngineService } from '../../calendar-engine/services/calendar-engine.service';

import { DateUtils } from '../../calendar-engine/utils/date.utils';
import { CalendarViewMode } from '../../calendar-engine/types/calendar-view-model.type';
import { MonthWeekRow } from '../../calendar-engine/models/month-view.model';
import { MonthLayoutEngine } from '../../calendar-engine/layout/month-layout-engine';
import { MonthScrollWindow } from '../../calendar-engine/models/month-scroll-window.model';
import { WeekViewModel } from '../../calendar-engine/models/week-view.model';
import { DayViewModel } from '../../calendar-engine/models/day-view.model';
import { CalendarLayoutItem } from '../../calendar-engine/models/calendar-layout-item.model';

import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { AgendaDayGroup } from '../../models/agenda-day-group.model';
import { Item } from '../../models/board.model';
import { SavePayload } from '../../models/save-payload.model';

import { DragSession } from '../../calendar-engine/interactions/drag/drag-session.model';
import { ResizeSession } from '../../calendar-engine/interactions/resize/resize-session.model';
import { EventDragEngine } from '../../calendar-engine/interactions/drag/event-drag-engine';
import { EventResizeEngine } from '../../calendar-engine/interactions/resize/event-resize-engine';

import { getAttendanceColor, getAttendanceLabel } from '../../utils/attendance.utils';
import { CalendarTimeBlock } from '../../models/calendar-time-block.model';
import { ActivatedRoute, Router } from '@angular/router';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { CreateSession } from '../../calendar-engine/interactions/create/create-session.model';
import { DragPositionUtil } from '../../calendar-engine/interactions/drag/drag-position.util';
import { EventCreateEngine } from '../../calendar-engine/interactions/create/event-create-engine';

import { MonthScrollViewComponent, VisibleMonthChangeEvent } from './month-scroll-view/month-scroll-view.component';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDialogModule,
    MatTooltipModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    DragDropModule,
    CalendarDialogComponent,
    MonthScrollViewComponent,
  ],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent implements OnInit, OnDestroy {

  // ── State ──────────────────────────────────────────────────────────────────
  alwaysAllowDrop = (): boolean => true;
  events: CalendarEventUI[] = [];
  selectedDate: Date = new Date();
  linkedRecord: Item | null = null;
  userId: string | undefined;
  isLoading: boolean = false;

  // ── View mode ──────────────────────────────────────────────────────────────

  viewMode: CalendarViewMode = 'month';
  monthScrollWindow!: MonthScrollWindow;
  /** Header label / "which month is scrolled into view" — decoupled from selectedDate. */
  visibleMonthLabel: Date = new Date();
  /** Set transiently to force the scroll view to jump to a date (nav buttons, datepicker, Today). */
  scrollToDate: Date | null = null;

  weekView!: WeekViewModel;
  dayView!: DayViewModel;
  agendaView!: AgendaDayGroup[];

  // ── UI constants ───────────────────────────────────────────────────────────

  readonly weekdays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly hours: number[] = Array.from({ length: 24 }, (_, i) => i);
  readonly MAX_VISIBLE_LANES = 3;
  readonly HOUR_HEIGHT = 80;

  // ── Interaction sessions ───────────────────────────────────────────────────

  dragSession: DragSession | null = null;
  resizeSession: ResizeSession | null = null;
  createSession: CreateSession | null = null;

  // ── Now indicator ──────────────────────────────────────────────────────────

  nowIndicatorTop: number = 0;
  private nowTimer: ReturnType<typeof setInterval> | undefined;

  // ── Utility aliases exposed to template ───────────────────────────────────

  readonly attendanceColor = getAttendanceColor;
  readonly attendanceLabel = getAttendanceLabel;

  // ── Injected services ──────────────────────────────────────────────────────

  private readonly engine = inject(CalendarEngineService);
  private reminderSubscription!: Subscription;
  private pendingEventIdFromRedirect: number | null = null;
  monthDragEvent: CalendarEventUI | null = null;

  /** Tracks the widest range of events we've fetched so far for month mode (incremental fetch). */
  private monthFetchedStart: Date | null = null;
  private monthFetchedEnd: Date | null = null;

  private needMoreRange$ = new Subject<{ start: Date; end: Date }>();
  private needMoreRangeSub!: Subscription;

  constructor(
    private calendarService: CalendarService,
    private dialog: MatDialog,
    private notificationService: NotificationRealtimeService,
    private snackBar: MatSnackBar,
    private authService: AuthService,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router,
  ) { }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  ngOnInit(): void {
    const activeId = this.authService.getUserId();
    if (activeId) this.userId = activeId;

    this.applyRedirectQueryParams();

    this.fetchEvents();
    this.updateNowIndicator();
    this.nowTimer = setInterval(() => this.updateNowIndicator(), 60_000);
    this.listenForLiveReminders();

    // switchMap cancels any in-flight "need more events" request the
    // instant a newer one comes in, so a stale, late-arriving response
    // for an older range can never overwrite state set by a fresher one.
    // This is also the single place isLoading is driven for every month
    // events refresh (scroll-triggered *and* save-triggered — see
    // refreshAfterSave()), rather than toggling it manually at each call
    // site: tap() sets it true the instant a range is requested, finalize()
    // clears it exactly once the request settles (success, error, or
    // superseded by a newer one), so it can never leak or need a matching
    // reset at every caller.
    this.needMoreRangeSub = this.needMoreRange$.pipe(
      tap(() => this.isLoading = true),
      switchMap(range =>
        this.calendarService.getEvents(range.start, range.end).pipe(
          map(fetched => ({ fetched, range })),
          finalize(() => this.isLoading = false),
        ),
      ),
    ).subscribe({
      next: ({ fetched, range }) => {
        this.mergeEvents(fetched);
        this.monthFetchedStart = range.start;
        this.monthFetchedEnd = range.end;
        this.monthScrollWindow = this.engine.recomputeAllMonthScrollWeeks(this.monthScrollWindow, this.events);
      },
      error: err => console.error('Error fetching additional month events:', err),
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.nowTimer);
    this.reminderSubscription?.unsubscribe();
    this.needMoreRangeSub?.unsubscribe();
    window.removeEventListener('mousemove', this.onDragging);
    window.removeEventListener('mouseup', this.stopDrag);
    window.removeEventListener('mousemove', this.onResizing);
    window.removeEventListener('mouseup', this.stopResize);
    window.removeEventListener('mousemove', this.onCreating);
    window.removeEventListener('mouseup', this.stopCreate);
  }

  private applyRedirectQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const eventIdParam = params.get('eventId');
    const dateParam = params.get('date');

    if (dateParam) {
      const parsedDate = new Date(dateParam);
      if (!isNaN(parsedDate.getTime())) {
        this.selectedDate = parsedDate;
      }
    }

    if (eventIdParam) {
      const parsedId = Number(eventIdParam);
      if (!isNaN(parsedId)) {
        this.pendingEventIdFromRedirect = parsedId;
      }
    }
  }

  // ==========================================================================
  // REMINDERS
  // ==========================================================================

  private listenForLiveReminders(): void {
    this.reminderSubscription = this.notificationService.reminders$.subscribe({
      next: reminder => this.displayInteractiveReminder(reminder.message, reminder.eventId),
      error: err => console.error('Real-time channel broadcast error:', err),
    });
  }

  private displayInteractiveReminder(message: string, eventId: number): void {
    this.zone.run(() => {
      const matchedEvent = this.events.find(e => e.id === eventId);
      const eventColor = matchedEvent?.eventColor ?? '#4f87f5';
      const timeUntil = this.buildTimeUntilLabel(matchedEvent);

      const ref = this.snackBar.openFromComponent(LiveReminderToastComponent, {
        duration: 12_000,
        horizontalPosition: 'right',
        verticalPosition: 'top',
        panelClass: ['clean-reminder-viewport-override'],
        data: { message, eventId, color: eventColor, timeUntil },
      });

      ref.onAction().subscribe(() => this.openEventById(eventId));
    });
  }

  private buildTimeUntilLabel(event: CalendarEventUI | undefined): string | undefined {
    if (!event?.startDate) return undefined;

    const diffMs = new Date(event.startDate).getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60_000);
    const timeStr = new Date(event.startDate)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return diffMin > 0
      ? `Starts in ${diffMin} minute${diffMin !== 1 ? 's' : ''} · ${timeStr}`
      : `Starting now · ${timeStr}`;
  }

  // ==========================================================================
  // NOW INDICATOR
  // ==========================================================================

  updateNowIndicator(): void {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    this.nowIndicatorTop = (minutes / 60) * this.HOUR_HEIGHT;
  }

  // ==========================================================================
  // VIEW MODE
  // ==========================================================================

  setViewMode(mode: CalendarViewMode): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.fetchEvents(mode === 'month'); // switching into month view re-centers on selectedDate
  }

  /** Rebuilds the non-month views. Month view is now driven incrementally via the scroll component. */
  generateCurrentView(): void {
    switch (this.viewMode) {
      case 'month':
        // Month view initializes/refreshes its window separately — see
        // initializeMonthScrollWindowIfNeeded() / refreshMonthWindowLayout().
        break;
      case 'week':
        this.weekView = this.engine.buildWeekView(this.selectedDate, this.events);
        break;
      case 'day':
        this.dayView = this.engine.buildDayView(this.selectedDate, this.events);
        break;
      case 'agenda':
        this.agendaView = this.engine.buildAgendaView(this.selectedDate, this.events);
        break;
    }
  }

  // ── Week view helpers ──────────────────────────────────────────────────────

  get weekViewDates(): Date[] {
    return this.weekView?.columns.map(c => c.date) ?? [];
  }

  getWeekDayLayouts(date: Date): CalendarLayoutItem<CalendarEventUI>[] {
    const column = this.weekView?.columns.find(c => DateUtils.isSameDate(c.date, date));
    return column?.layoutItems ?? [];
  }

  // ==========================================================================
  // MONTH SCROLL WINDOW
  // ==========================================================================

  private initializeMonthScrollWindow(centerDate: Date): void {
    this.monthScrollWindow = this.engine.initializeMonthScrollWindow(centerDate, this.events);
    this.monthFetchedStart = new Date(this.monthScrollWindow.loadedStart);
    this.monthFetchedEnd = new Date(this.monthScrollWindow.loadedEnd);
    this.visibleMonthLabel = new Date(centerDate);
    // Re-centering replaces the whole window (different weeks, different
    // scrollHeight) but the scroll view stays mounted across month-mode
    // navigation, so its scrollTop is left stale against the new content
    // unless we explicitly tell it to re-sync — same mechanism the
    // already-loaded nav path uses.
    this.scrollToDate = new Date(centerDate);
  }

  onMonthWindowChange(next: MonthScrollWindow): void {
    this.monthScrollWindow = next;
  }

  onVisibleMonthChange(evt: VisibleMonthChangeEvent): void {
    this.visibleMonthLabel = new Date(evt.year, evt.month, 1);
  }

  /**
   * Fired by MonthScrollViewComponent when it's about to append/prepend
   * weeks that fall outside the range we've already fetched events for.
   * We only hit the network for the genuinely new slice.
   */
  onNeedMoreMonthEvents(range: { start: Date; end: Date }): void {
    if (!this.monthFetchedStart || !this.monthFetchedEnd) return;

    const needsFetch =
      range.start < this.monthFetchedStart || range.end > this.monthFetchedEnd;

    if (!needsFetch) return;

    const fetchStart = range.start < this.monthFetchedStart ? range.start : this.monthFetchedStart;
    const fetchEnd = range.end > this.monthFetchedEnd ? range.end : this.monthFetchedEnd;

    this.needMoreRange$.next({ start: fetchStart, end: fetchEnd });
  }

  /**
   * Merge newly-fetched events into this.events, deduping by occurrenceKey.
   *
   * `id` is NOT unique here — every occurrence of a recurring series shares
   * the same `id` (the backend projects Id = BaseEventId for each one), so
   * deduping by `id` would collapse all of a series' occurrences down to
   * whichever was processed last, silently dropping the rest. `occurrenceKey`
   * is unique per occurrence (and still stable across re-fetches of the same
   * occurrence, so repeated merges don't grow the array).
   */
  private mergeEvents(fetched: any[]): void {
    const normalized: CalendarEventUI[] = fetched.map(event => ({
      ...event,
      startDate: new Date(event.startDate),
      endDate: new Date(event.endDate),
    }));

    const byKey = new Map<string | number, CalendarEventUI>();
    for (const e of this.events) byKey.set(e.occurrenceKey ?? e.id!, e);
    for (const e of normalized) byKey.set(e.occurrenceKey ?? e.id!, e);

    this.events = Array.from(byKey.values());
  }

  // ── Month view helpers (used by calendar.component.html's +more menu, if kept there) ──

  getHiddenCountForDay(date: Date, row: MonthWeekRow): number {
    const colIdx = row.dates.findIndex(d => DateUtils.isSameDate(d, date));
    return row.layoutItems.filter(
      item =>
        item.lane >= this.MAX_VISIBLE_LANES &&
        item.columnStart <= colIdx + 1 &&
        item.columnStart + item.columnSpan - 1 >= colIdx + 1,
    ).length;
  }

  // ==========================================================================
  // FETCH EVENTS
  // ==========================================================================

  fetchEvents(recenter: boolean = false): void {
    const { start, end } = this.buildFetchRange(recenter);
    this.isLoading = true;

    this.calendarService.getEvents(start, end).subscribe({
      next: (events: any[]) => {
        this.events = events.map(event => ({
          ...event,
          startDate: new Date(event.startDate),
          endDate: new Date(event.endDate),
        }));

        if (this.viewMode === 'month') {
          if (recenter || !this.monthScrollWindow) {
            this.initializeMonthScrollWindow(this.selectedDate); // sets monthFetchedStart/End
          } else {
            this.monthScrollWindow = this.engine.recomputeAllMonthScrollWeeks(this.monthScrollWindow, this.events);
          }
        } else {
          this.generateCurrentView();
        }

        this.openPendingRedirectEventIfAny();
        this.isLoading = false;
      },
      error: err => {
        console.error('Error fetching events:', err);
        this.isLoading = false;
      },
    });
  }

  private openPendingRedirectEventIfAny(): void {
    if (this.pendingEventIdFromRedirect == null) return;

    const eventId = this.pendingEventIdFromRedirect;
    this.pendingEventIdFromRedirect = null;

    this.openEventById(eventId);

    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  private openEventById(eventId: number): void {
    const matchedEvent = this.events.find(e => e.id === eventId);
    if (matchedEvent) {
      this.openDialog(matchedEvent);
    } else {
      console.log(`Event #${eventId} is outside the current viewport scope.`);
      this.snackBar.open('Could not find that event on the calendar.', 'Dismiss', { duration: 5000 });
    }
  }

  private buildFetchRange(recenter: boolean): { start: Date; end: Date } {
    switch (this.viewMode) {
      case 'month': {
        // Refreshing in place (save/drag) — reuse the range already on
        // screen instead of recomputing one from selectedDate, so the
        // viewport doesn't move.
        if (!recenter && this.monthFetchedStart && this.monthFetchedEnd) {
          return { start: this.monthFetchedStart, end: this.monthFetchedEnd };
        }

        // Recentering (explicit navigation) or first load.
        const centerWeekStart = DateUtils.startOfWeek(this.selectedDate);
        const start = DateUtils.addDays(centerWeekStart, -4 * 7);
        const end = DateUtils.addDays(centerWeekStart, (8 + 1) * 7);
        return { start, end };
      }

      case 'week': { /* unchanged */
        const cols = this.weekView?.columns;
        if (cols?.length) {
          const end = new Date(cols[6].date);
          end.setDate(end.getDate() + 1);
          return { start: new Date(cols[0].date), end };
        }
        const weekStart = DateUtils.startOfWeek(this.selectedDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return { start: weekStart, end: weekEnd };
      }

      case 'day': { /* unchanged */
        const start = new Date(this.selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(this.selectedDate);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }

      case 'agenda': { /* unchanged */
        const start = new Date(this.selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 30);
        return { start, end };
      }

      default: {
        const now = new Date();
        return { start: now, end: now };
      }
    }
  }

  // ==========================================================================
  // DATE HELPERS
  // ==========================================================================

  isToday(date: Date): boolean {
    return DateUtils.isSameDate(date, new Date());
  }

  isSameDate(a: Date, b: Date): boolean {
    return DateUtils.isSameDate(a, b);
  }

  getWeekNumber(date: Date): number {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const jan4 = new Date(d.getFullYear(), 0, 4);
    jan4.setDate(jan4.getDate() + 3 - ((jan4.getDay() + 6) % 7));
    return 1 + Math.floor((d.getTime() - jan4.getTime()) / (7 * 24 * 60 * 60 * 1000));
  }

  getDayOfYear(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff =
      date.getTime() -
      startOfYear.getTime() +
      (startOfYear.getTimezoneOffset() - date.getTimezoneOffset()) * 60_000;
    return Math.floor(diff / (1_000 * 60 * 60 * 24));
  }

  formatHour(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  getTooltip(event: CalendarEventUI): string {
    let tip = event.eventTypeName
      ? `${event.subject} — ${event.eventTypeName}`
      : event.subject;

    if (event.attendanceScore != null) {
      const label = this.attendanceLabel(event.attendanceScore);
      tip += `\nAttendance: ${label} (${(event.attendanceScore * 100).toFixed(0)}%)`;
    }

    return tip;
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  onDateSelectedFromPicker(date: Date): void {
    this.selectedDate = date;
    this.navigateMonthViewTo(date);
  }

  goToPreviousMonth(): void {
    this.selectedDate = this.shiftDate(this.selectedDate, this.viewMode, -1);
    this.navigateMonthViewTo(this.selectedDate);
  }

  goToNextMonth(): void {
    this.selectedDate = this.shiftDate(this.selectedDate, this.viewMode, 1);
    this.navigateMonthViewTo(this.selectedDate);
  }

  goToToday(): void {
    this.selectedDate = new Date();
    this.navigateMonthViewTo(this.selectedDate);
  }

  /**
   * Central navigation entry point for month mode. If the target date is
   * already inside the loaded scroll window, we just smooth-scroll to it
   * (true "continuous" feel — no grid replacement). If it's far outside
   * the loaded range, we re-fetch and re-center the window on it.
   */
  private navigateMonthViewTo(date: Date): void {
    if (this.viewMode !== 'month') {
      this.generateCurrentView();
      this.fetchEvents(true);
      return;
    }

    const alreadyLoaded =
      this.monthScrollWindow &&
      date >= this.monthScrollWindow.loadedStart &&
      date <= this.monthScrollWindow.loadedEnd;

    if (alreadyLoaded) {
      this.scrollToDate = new Date(date);
      return;
    }

    this.fetchEvents(true); // outside the loaded window — recenter jump
  }

  private shiftDate(date: Date, mode: CalendarViewMode, direction: 1 | -1): Date {
    const d = new Date(date);
    switch (mode) {
      case 'month':
        return new Date(d.getFullYear(), d.getMonth() + direction, 1);
      case 'week':
        d.setDate(d.getDate() + direction * 7);
        return d;
      case 'day':
        d.setDate(d.getDate() + direction);
        return d;
      case 'agenda':
        d.setDate(d.getDate() + direction * 30);
        return d;
      default:
        return d;
    }
  }

  // ==========================================================================
  // EVENT INTERACTIONS
  // ==========================================================================

  onEmptyDayClicked(date: Date): void {
    this.selectedDate = date;
    this.openDialog(null);
  }

  onEventClicked(event: CalendarEventUI, e: MouseEvent): void {
    e.stopPropagation();
    this.selectedDate = new Date(event.startDate);
    this.openDialog(event);
  }

  openDialog(
    eventData: CalendarEventUI | null = null,
    initialStart?: Date,
    initialEnd?: Date,
  ): void {
    const dialogRef = this.dialog.open(CalendarDialogComponent, {
      width: '70%',
      height: '80vh',
      maxWidth: 'none',
      disableClose: true,
      data: { date: this.selectedDate, eventData, initialStart, initialEnd },
    });

    dialogRef.componentInstance.onSave.subscribe(({ record, attachments }: SavePayload) => {
      const scope = record.recurrenceScope as RecurrenceUpdateScope | null;
      const save$ = record.isRecurring && record.id && scope
        ? this.calendarService.saveOccurrence(record, scope)
        : record.id
          ? this.calendarService.updateEvent(record.id, record)
          : this.calendarService.saveEvent(record);

      this.executeSave(save$, record, attachments, dialogRef);
    });

    dialogRef.componentInstance.onCancel.subscribe(() => dialogRef.close());

    const attemptClose = () => {
      if (!dialogRef.componentInstance.hasUnsavedChanges) {
        dialogRef.close();
        return;
      }
      if (window.confirm('You have unsaved changes.\n\nDiscard them?')) {
        dialogRef.close();
      }
    };

    dialogRef.backdropClick().subscribe(() => attemptClose());
    dialogRef.keydownEvents().subscribe(evt => {
      if (evt.key === 'Escape') attemptClose();
    });
  }

  // ==========================================================================
  // RECURRENCE SAVE HELPERS
  // ==========================================================================

  private executeSave(
    save$: Observable<any>,
    record: any,
    attachments: File[],
    dialogRef: any,
  ): void {
    save$.subscribe({
      next: (savedEvent: any) => {
        const isOccurrence = !!record.seriesUid && record.id !== record.baseEventId;
        const eventId = isOccurrence ? record.baseEventId : savedEvent?.id;

        if (attachments?.length && eventId) {
          const formData = new FormData();
          attachments.forEach((f: File) => formData.append('files', f));
          this.calendarService.uploadAttachments(eventId, formData)
            .subscribe(() => this.refreshAfterSave());
        } else {
          this.refreshAfterSave();
        }

        dialogRef.close();
      },
      error: (err: any) => console.error('Failed to save event:', err),
    });
  }

  // ==========================================================================
  // CREATE (click / drag on an empty slot in Week or Day view)
  // ==========================================================================

  startCreate(e: MouseEvent, date: Date): void {
    if (e.button !== 0) return;
    e.preventDefault();

    const container = e.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const startMinutes = EventCreateEngine.yToMinutes(e.clientY - rect.top);

    this.createSession = {
      columnDate: date,
      container,
      startMouseY: e.clientY,
      startMinutes,
      endMinutes: startMinutes,
      dragged: false,
    };

    window.addEventListener('mousemove', this.onCreating);
    window.addEventListener('mouseup', this.stopCreate);
  }

  onCreating = (e: MouseEvent): void => {
    if (!this.createSession) return;

    if (Math.abs(e.clientY - this.createSession.startMouseY) > 4) {
      this.createSession.dragged = true;
    }

    const rect = this.createSession.container.getBoundingClientRect();
    this.createSession.endMinutes = EventCreateEngine.yToRawMinutes(e.clientY - rect.top);
  };

  stopCreate = (): void => {
    if (!this.createSession) return;

    const session = this.createSession;
    window.removeEventListener('mousemove', this.onCreating);
    window.removeEventListener('mouseup', this.stopCreate);
    this.createSession = null;

    const range = session.dragged
      ? EventCreateEngine.buildDragRange(session.startMinutes, session.endMinutes)
      : EventCreateEngine.buildClickRange(session.startMinutes);

    const start = EventCreateEngine.minutesToDate(session.columnDate, range.startMinutes);
    const end = EventCreateEngine.minutesToDate(session.columnDate, range.endMinutes);

    this.selectedDate = start;
    this.openDialog(null, start, end);
  };

  get createPreviewTop(): number {
    if (!this.createSession) return 0;
    const range = this.currentCreateRange();
    return DragPositionUtil.minutesToPixels(range.startMinutes);
  }

  get createPreviewHeight(): number {
    if (!this.createSession) return 0;
    const range = this.currentCreateRange();
    return DragPositionUtil.minutesToPixels(range.endMinutes - range.startMinutes);
  }

  isCreatingInColumn(date: Date): boolean {
    return !!this.createSession && DateUtils.isSameDate(this.createSession.columnDate, date);
  }

  private currentCreateRange(): { startMinutes: number; endMinutes: number } {
    const session = this.createSession!;
    return session.dragged
      ? EventCreateEngine.buildDragRange(session.startMinutes, session.endMinutes)
      : EventCreateEngine.buildClickRange(session.startMinutes);
  }

  /**
   * Finds the exact occurrence a drag/resize/drop interaction started on.
   * Matching by `occurrenceKey` (falling back to `id` only if it's missing)
   * is required, not optional — `id` alone is shared by every occurrence of
   * a recurring series, so a plain `find(e => e.id === target.id)` can
   * silently resolve to the wrong occurrence when more than one from the
   * same series is currently loaded.
   */
  private findEventByOccurrence(target: { id?: number; occurrenceKey?: string }): CalendarEventUI | undefined {
    return this.events.find(e =>
      target.occurrenceKey ? e.occurrenceKey === target.occurrenceKey : e.id === target.id,
    );
  }

  // ==========================================================================
  // DRAG (week/day time-grid views — unchanged)
  // ==========================================================================

  startDrag(e: MouseEvent, block: CalendarLayoutItem<CalendarEventUI>, date: Date): void {
    e.preventDefault();
    e.stopPropagation();

    const timeBlock: CalendarTimeBlock = {
      ...block.event,
      top: block.top,
      height: block.height,
      left: block.left,
      width: block.width,
      overlapIndex: block.lane,
      overlapCount: block.laneCount,
    };

    this.dragSession = {
      event: timeBlock,
      startMouseY: e.clientY,
      startMouseX: e.clientX,
      originalStart: new Date(block.event.startDate),
      originalEnd: new Date(block.event.endDate),
      originalTop: block.top,
      sourceDate: date,
    };
    window.addEventListener('mousemove', this.onDragging);
    window.addEventListener('mouseup', this.stopDrag);
  }

  onDragging = (e: MouseEvent): void => {
    if (!this.dragSession) return;

    const deltaY = e.clientY - this.dragSession.startMouseY;
    const minuteDelta = EventDragEngine.calculateMinuteDelta(deltaY);
    const updated = EventDragEngine.moveDates(
      this.dragSession.originalStart,
      this.dragSession.originalEnd,
      minuteDelta,
    );

    const source = this.findEventByOccurrence(this.dragSession!.event);
    if (!source) return;

    source.startDate = updated.start;
    source.endDate = updated.end;
    this.generateCurrentView();
  };

  stopDrag = (): void => {
    if (!this.dragSession) return;

    const updated = this.findEventByOccurrence(this.dragSession.event);
    if (updated) this.persistEventUpdate(updated, this.dragSession.originalStart);

    this.dragSession = null;
    window.removeEventListener('mousemove', this.onDragging);
    window.removeEventListener('mouseup', this.stopDrag);
  };

  // ==========================================================================
  // RESIZE (week/day time-grid views — unchanged)
  // ==========================================================================

  startResize(
    e: MouseEvent,
    block: CalendarLayoutItem<CalendarEventUI>,
    direction: 'top' | 'bottom',
  ): void {
    e.preventDefault();
    e.stopPropagation();

    const timeBlock: CalendarTimeBlock = {
      ...block.event,
      top: block.top,
      height: block.height,
      left: block.left,
      width: block.width,
      overlapIndex: block.lane,
      overlapCount: block.laneCount,
    };

    this.resizeSession = {
      event: timeBlock,
      direction,
      startMouseY: e.clientY,
      originalStart: new Date(block.event.startDate),
      originalEnd: new Date(block.event.endDate),
      originalTop: block.top,
      originalHeight: block.height,
    };

    window.addEventListener('mousemove', this.onResizing);
    window.addEventListener('mouseup', this.stopResize);
  }

  onResizing = (e: MouseEvent): void => {
    if (!this.resizeSession) return;

    const deltaY = e.clientY - this.resizeSession.startMouseY;
    const updated = this.resizeSession.direction === 'top'
      ? EventResizeEngine.resizeTop(this.resizeSession.originalStart, this.resizeSession.originalEnd, deltaY)
      : EventResizeEngine.resizeBottom(this.resizeSession.originalStart, this.resizeSession.originalEnd, deltaY);

    const source = this.findEventByOccurrence(this.resizeSession!.event);
    if (!source) return;

    source.startDate = updated.start;
    source.endDate = updated.end;
    this.generateCurrentView();
  };

  stopResize = (): void => {
    if (!this.resizeSession) return;

    const updated = this.findEventByOccurrence(this.resizeSession!.event);
    if (updated) this.persistEventUpdate(updated, this.resizeSession.originalStart);

    this.resizeSession = null;
    window.removeEventListener('mousemove', this.onResizing);
    window.removeEventListener('mouseup', this.stopResize);
  };

  // ==========================================================================
  // SHARED PERSIST (drag + resize share the same save path)
  // ==========================================================================

  private persistEventUpdate(event: CalendarEventUI, originalStart: Date): void {
    if (event.isRecurring) {
      this.calendarService.updateSingleOccurrence({
        seriesUid: event.seriesUid!,
        occurrenceDate: originalStart.toISOString(),
        subject: event.subject,
        comment: event.comment,
        startDate: new Date(event.startDate).toISOString(),
        endDate: new Date(event.endDate).toISOString(),
        location: event.location,
        eventTypeId: event.eventTypeId,
        isCancelled: false,
      }).subscribe({
        next: () => this.refreshAfterSave(),
        error: err => console.error('Failed to update recurring event:', err),
      });
    } else {
      this.calendarService.updateEvent(event.id!, event).subscribe({
        next: () => this.refreshAfterSave(),
        error: err => console.error('Failed to update event:', err),
      });
    }
  }

  // ==========================================================================
  // MONTH VIEW: drag start/end + drop (delegated from MonthScrollViewComponent)
  // ==========================================================================

  onMonthDragStart(event: CalendarEventUI): void {
    this.monthDragEvent = event;
  }

  onMonthDragEnd(): void {
    this.monthDragEvent = null;
  }

  onMonthEventDropped(event: CdkDragDrop<MonthWeekRow>): void {
    const dragged = event.item.data as CalendarEventUI;
    if (!dragged?.id) return;

    const draggedEvent = this.findEventByOccurrence(dragged);
    if (!draggedEvent) return;

    const oldStart = new Date(draggedEvent.startDate);
    const oldEnd = new Date(draggedEvent.endDate);

    const targetRowData = event.container.data as MonthWeekRow;
    if (!targetRowData || !targetRowData.dates) return;

    const overlay = event.container.element.nativeElement as HTMLElement;
    const rect = overlay.getBoundingClientRect();
    const columnIndex = MonthLayoutEngine.columnIndexFromPointerX(rect.left, rect.width, event.dropPoint.x);

    const targetDate = new Date(targetRowData.dates[columnIndex]);

    targetDate.setHours(
      oldStart.getHours(),
      oldStart.getMinutes(),
      oldStart.getSeconds(),
      oldStart.getMilliseconds()
    );

    const duration = oldEnd.getTime() - oldStart.getTime();
    const newEnd = new Date(targetDate.getTime() + duration);

    if (oldStart.toDateString() === targetDate.toDateString()) return;

    draggedEvent.startDate = targetDate;
    draggedEvent.endDate = newEnd;

    // Only recompute the affected week row(s) instead of the whole loaded
    // scroll window — keeps drag interactions smooth even with dozens of
    // weeks loaded.
    this.monthScrollWindow = this.engine.recomputeMonthScrollWeekForDate(
      this.monthScrollWindow,
      oldStart,
      this.events,
    );
    this.monthScrollWindow = this.engine.recomputeMonthScrollWeekForDate(
      this.monthScrollWindow,
      targetDate,
      this.events,
    );

    this.persistEventUpdate(draggedEvent, oldStart);
  }

  private refreshAfterSave(): void {
    if (this.viewMode !== 'month' || !this.monthScrollWindow) {
      this.fetchEvents();
      return;
    }

    // Routed through the same needMoreRange$ pipeline scroll-triggered
    // loads use (see ngOnInit), rather than fetching+merging independently
    // here: this way a save-triggered refresh shows the same loading
    // overlay (isLoading is driven entirely by that pipeline) and can't
    // race against a concurrent scroll-triggered one — switchMap guarantees
    // whichever request was issued last is the one that wins.
    const fetchStart = this.monthFetchedStart ?? this.monthScrollWindow.loadedStart;
    const fetchEnd = this.monthFetchedEnd ?? this.monthScrollWindow.loadedEnd;

    this.needMoreRange$.next({ start: fetchStart, end: fetchEnd });
  }
}
