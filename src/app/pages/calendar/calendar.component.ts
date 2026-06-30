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
import { Observable, Subscription } from 'rxjs';

import { CalendarDialogComponent } from '../calendar-dialog/calendar-dialog.component';
import { LiveReminderToastComponent } from '../live-reminder-toast/live-reminder-toast.component';
import {
  RecurrenceScopeDialogComponent,
  RecurrenceUpdateScope,
} from '../recurrence-scope-dialog/recurrence-scope-dialog.component';

import { CalendarService } from '../../_services/calendar.service';
import { NotificationRealtimeService } from '../../_services/notification-realtime.service';
import { AuthService } from '../../_services/auth.service';
import { CalendarEngineService } from '../../calendar-engine/services/calendar-engine.service';

import { DateUtils } from '../../calendar-engine/utils/date.utils';
import { CalendarViewMode } from '../../calendar-engine/types/calendar-view-model.type';
import { MonthViewModel, MonthWeekRow } from '../../calendar-engine/models/month-view.model';
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
import { DragDropModule } from '@angular/cdk/drag-drop';

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
  monthView!: MonthViewModel;
  weekView!: WeekViewModel;
  dayView!: DayViewModel;
  agendaView!: AgendaDayGroup[];

  // ── UI constants ───────────────────────────────────────────────────────────

  readonly weekdays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly hours: number[] = Array.from({ length: 24 }, (_, i) => i);
  readonly MAX_VISIBLE_LANES = 3;
  readonly HOUR_HEIGHT = 80;

  // ── "More" overflow menu ───────────────────────────────────────────────────

  selectedMoreEvents: CalendarEventUI[] = [];
  selectedMoreDate: Date | null = null;

  // ── Interaction sessions ───────────────────────────────────────────────────

  dragSession: DragSession | null = null;
  resizeSession: ResizeSession | null = null;

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
  private monthDragEvent: CalendarEventUI | null = null;

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

    this.generateCurrentView();
    this.fetchEvents();
    this.updateNowIndicator();
    this.nowTimer = setInterval(() => this.updateNowIndicator(), 60_000);
    this.listenForLiveReminders();
  }

  ngOnDestroy(): void {
    clearInterval(this.nowTimer);
    this.reminderSubscription?.unsubscribe();
    window.removeEventListener('mousemove', this.onDragging);
    window.removeEventListener('mouseup', this.stopDrag);
    window.removeEventListener('mousemove', this.onResizing);
    window.removeEventListener('mouseup', this.stopResize);
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
    if (this.viewMode === mode)
      return;

    this.viewMode = mode;
    this.fetchEvents();
  }

  generateCurrentView(): void {
    switch (this.viewMode) {
      case 'month':
        this.monthView = this.engine.buildMonthView(this.selectedDate, this.events);
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

  /** The 7 date objects for the current week view column headers. */
  get weekViewDates(): Date[] {
    return this.weekView?.columns.map(c => c.date) ?? [];
  }

  /** Layout items for a specific date column in the week view. */
  getWeekDayLayouts(date: Date): CalendarLayoutItem<CalendarEventUI>[] {
    const column = this.weekView?.columns.find(c => DateUtils.isSameDate(c.date, date));
    return column?.layoutItems ?? [];
  }

  // ── Month view helpers ─────────────────────────────────────────────────────

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

  // Update fetchEvents()
  fetchEvents(): void {
    const { start, end } = this.buildFetchRange();
    this.isLoading = true; // ← start loading

    this.calendarService.getEvents(start, end).subscribe({
      next: (events: any[]) => {
        this.events = events.map(event => ({
          ...event,
          startDate: new Date(event.startDate),
          endDate: new Date(event.endDate),
        }));
        this.generateCurrentView();
        this.openPendingRedirectEventIfAny();
        this.isLoading = false; // ← done
      },
      error: err => {
        console.error('Error fetching events:', err);
        this.isLoading = false; // ← also clear on error
      },
    });
  }

  // NEW
  private openPendingRedirectEventIfAny(): void {
    if (this.pendingEventIdFromRedirect == null) return;

    const eventId = this.pendingEventIdFromRedirect;
    this.pendingEventIdFromRedirect = null; // consume once, so paging months later doesn't reopen it

    this.openEventById(eventId);

    // strip the query params so a refresh/navigation doesn't reopen the dialog
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  private openEventById(eventId: number): void {
    const matchedEvent = this.events.find(e => e.id === eventId);
    if (matchedEvent) {
      this.openDialog(matchedEvent);
    } else {
      console.log(`Event #${eventId} is outside the current viewport scope.`);
      this.snackBar.open('Could not find that event on the calendar.', 'Dismiss', { duration: 5000 }); // ADDED
    }
  }

  private buildFetchRange(): { start: Date; end: Date } {
    switch (this.viewMode) {
      case 'month':
        return {
          start: new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1),
          end: new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + 1, 1),
        };

      case 'week': {
        const cols = this.weekView?.columns;
        if (cols?.length) {
          const end = new Date(cols[6].date);
          end.setDate(end.getDate() + 1);
          return { start: new Date(cols[0].date), end };
        }
        // Fallback before weekView is initialised
        const weekStart = DateUtils.startOfWeek(this.selectedDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return { start: weekStart, end: weekEnd };
      }

      case 'day': {
        const start = new Date(this.selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(this.selectedDate);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }

      case 'agenda': {
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
  // DATE HELPERS (delegates to DateUtils; thin wrappers for template use)
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
    this.generateCurrentView();
    this.fetchEvents();
  }

  goToPreviousMonth(): void {
    this.selectedDate = this.shiftDate(this.selectedDate, this.viewMode, -1);
    this.generateCurrentView();
    this.fetchEvents();
  }

  goToNextMonth(): void {
    this.selectedDate = this.shiftDate(this.selectedDate, this.viewMode, 1);
    this.generateCurrentView();
    this.fetchEvents();
  }

  goToToday(): void {
    this.selectedDate = new Date();
    this.generateCurrentView();
    this.fetchEvents();
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

  onMoreClicked(date: Date, row: MonthWeekRow, e: MouseEvent): void {
    e.stopPropagation();

    const dayMs = DateUtils.toDateOnly(date);
    const weekStartMs = DateUtils.toDateOnly(row.dates[0]);
    const colIdx = Math.floor((dayMs - weekStartMs) / DateUtils.DAY_MS) + 1;

    this.selectedMoreEvents = row.layoutItems
      .filter(
        item =>
          item.lane >= this.MAX_VISIBLE_LANES &&
          item.columnStart <= colIdx &&
          item.columnStart + item.columnSpan - 1 >= colIdx,
      )
      .map(item => item.event);

    this.selectedMoreDate = date;
  }

  openDialog(eventData: CalendarEventUI | null = null): void {
    const dialogRef = this.dialog.open(CalendarDialogComponent, {
      width: '70%',
      height: '80vh',
      maxWidth: 'none',
      disableClose: true,
      data: { date: this.selectedDate, eventData },
    });

    dialogRef.componentInstance.onSave.subscribe(({ record, attachments }: SavePayload) => {
      const scope = record.recurrenceScope as RecurrenceUpdateScope | null;
      const save$ = record.isRecurring && record.id && scope
        ? this.buildOccurrenceSave(record, scope)
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

  private buildOccurrenceSave(record: any, scope: RecurrenceUpdateScope): Observable<any> {
    const occurrenceDate = record.originalOccurrenceDate
      ? new Date(record.originalOccurrenceDate).toISOString()
      : new Date(record.startDate).toISOString();

    const startDate = new Date(record.startDate).toISOString();
    const endDate = new Date(record.endDate).toISOString();

    switch (scope) {
      case 'this':
        return this.calendarService.updateSingleOccurrence({
          seriesUid: record.seriesUid,
          occurrenceDate,
          subject: record.subject,
          comment: record.comment,
          startDate,
          endDate,
          location: record.location,
          eventTypeId: record.eventTypeId,
          isCancelled: false,
        });

      case 'thisAndFollowing':
        return this.calendarService.updateFromOccurrence({
          seriesUid: record.seriesUid,
          occurrenceDate,
          subject: record.subject,
          comment: record.comment,
          startDate,
          endDate,
          location: record.location,
        });

      case 'allPreserve':
        return this.calendarService.updateSeriesPreserveExceptions({
          seriesUid: record.seriesUid,
          subject: record.subject,
          comment: record.comment,
          location: record.location,
          recurrenceRuleJson: record.recurrenceRuleJson,
        });

      case 'allOverride':
        return this.calendarService.updateSeriesOverrideAll({
          seriesUid: record.seriesUid,
          subject: record.subject,
          comment: record.comment,
          location: record.location,
          recurrenceRuleJson: record.recurrenceRuleJson,
        });

      default:
        throw new Error(`Unsupported recurrence scope: ${scope}`);
    }
  }

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
            .subscribe(() => this.fetchEvents());
        } else {
          this.fetchEvents();
        }

        dialogRef.close();
      },
      error: (err: any) => console.error('Failed to save event:', err),
    });
  }

  // ==========================================================================
  // DRAG
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

    const source = this.events.find(x => x.id === this.dragSession!.event.id);
    if (!source) return;

    source.startDate = updated.start;
    source.endDate = updated.end;
    this.generateCurrentView();
  };

  stopDrag = (): void => {
    if (!this.dragSession) return;

    const updated = this.events.find(x => x.id === this.dragSession!.event.id);
    if (updated) this.persistEventUpdate(updated, this.dragSession.originalStart);

    this.dragSession = null;
    window.removeEventListener('mousemove', this.onDragging);
    window.removeEventListener('mouseup', this.stopDrag);
  };

  // ==========================================================================
  // RESIZE
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

    const source = this.events.find(x => x.id === this.resizeSession!.event.id);
    if (!source) return;

    source.startDate = updated.start;
    source.endDate = updated.end;
    this.generateCurrentView();
  };

  stopResize = (): void => {
    if (!this.resizeSession) return;

    const updated = this.events.find(x => x.id === this.resizeSession!.event.id);
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
        next: () => this.fetchEvents(),
        error: err => console.error('Failed to update recurring event:', err),
      });
    } else {
      this.calendarService.updateEvent(event.id!, event).subscribe({
        next: () => this.fetchEvents(),
        error: err => console.error('Failed to update event:', err),
      });
    }
  }

  onMonthDragStart(event: CalendarEventUI): void {
    this.monthDragEvent = event;
  }

  onMonthDragEnd(): void {
    this.monthDragEvent = null;
  }

  onMonthEventDropped(event: any, weekDates: Date[]): void {

    const dragged = event.item.data as CalendarEventUI;
    if (!dragged?.id) return;

    const draggedEvent = this.events.find(e => e.id === dragged.id);
    if (!draggedEvent) return;

    const oldStart = new Date(draggedEvent.startDate);
    const oldEnd = new Date(draggedEvent.endDate);

    // Calculate which day column was dropped onto
    const overlay = event.container.element.nativeElement as HTMLElement;
    const rect = overlay.getBoundingClientRect();

    const relativeX = event.dropPoint.x - rect.left;

    const columnWidth = rect.width / 7;

    const columnIndex = Math.max(
      0,
      Math.min(6, Math.floor(relativeX / columnWidth))
    );

    const targetDate = new Date(weekDates[columnIndex]);

    // Preserve time
    targetDate.setHours(
      oldStart.getHours(),
      oldStart.getMinutes(),
      oldStart.getSeconds(),
      oldStart.getMilliseconds()
    );

    // Preserve duration
    const duration = oldEnd.getTime() - oldStart.getTime();
    const newEnd = new Date(targetDate.getTime() + duration);

    if (oldStart.toDateString() === targetDate.toDateString())
      return;

    draggedEvent.startDate = targetDate;
    draggedEvent.endDate = newEnd;

    this.generateCurrentView();

    this.persistEventUpdate(draggedEvent, oldStart);
  }
}