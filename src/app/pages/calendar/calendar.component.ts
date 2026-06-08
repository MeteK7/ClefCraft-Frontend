import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { CalendarDialogComponent } from '../calendar-dialog/calendar-dialog.component';
import { Item } from '../../models/board.model';
import { CalendarService } from '../../_services/calendar.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { getAttendanceColor, getAttendanceLabel } from '../../utils/attendance.utils';
import { EventNormalizer } from '../../calendar-engine/utils/event-normalizer';
import { TimeBlockLayoutEngine } from '../../calendar-engine/layout/time-block-layout-engine';
import { MonthLayoutEngine, MonthLayoutItem } from '../../calendar-engine/layout/month-layout-engine';
import { DateUtils } from '../../calendar-engine/utils/date.utils';
import { AgendaDayGroup } from '../../models/agenda-day-group.model';
import { CalendarViewMode } from '../../calendar-engine/types/calendar-view-model.type';
import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { CalendarTimeBlock } from '../../models/calendar-time-block.model';
import { SavePayload } from '../../models/save-payload.model';
import { DragSession } from '../../calendar-engine/interactions/drag/drag-session.model';
import { ResizeSession } from '../../calendar-engine/interactions/resize/resize-session.model';
import { EventDragEngine } from '../../calendar-engine/interactions/drag/event-drag-engine';
import { EventResizeEngine } from '../../calendar-engine/interactions/resize/event-resize-engine';
import { Observable, Subscription } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// ── Recurrence scope ────────────────────────────────────────────────────────
import {
  RecurrenceScopeDialogComponent,
  RecurrenceUpdateScope,
} from '../recurrence-scope-dialog/recurrence-scope-dialog.component';
import { NotificationRealtimeService } from '../../_services/notification-realtime.service';
import { AuthService } from '../../_services/auth.service';

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
    CalendarDialogComponent,
    MatSnackBarModule
  ],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent implements OnInit, OnDestroy {

  events: CalendarEventUI[] = [];
  selectedDate: Date = new Date();
  linkedRecord: Item | null = null;
  userId: string | undefined;
  calendarGrid: Date[][] = [];
  weekdays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  agendaDayGroups: AgendaDayGroup[] = [];
  readonly MAX_VISIBLE_LANES = 3;
  readonly AGENDA_DAYS = 30;
  selectedMoreEvents: CalendarEventUI[] = [];
  selectedMoreDate: Date | null = null;
  attendanceLabel = getAttendanceLabel;
  attendanceColor = getAttendanceColor;
  dragSession: DragSession | null = null;
  resizeSession: ResizeSession | null = null;

  // =========================
  // VIEW MODES
  // =========================

  viewMode: CalendarViewMode = 'month';
  weekViewDates: Date[] = [];
  hours: number[] = Array.from({ length: 24 }, (_, i) => i);
  dayViewBlocks: CalendarTimeBlock[] = [];
  nowIndicatorTop: number = 0;
  readonly HOUR_HEIGHT = 80;
  private nowTimer: any;
  private reminderSubscription!: Subscription;

  // =========================
  // MONTH LAYOUT CACHE
  // =========================

  /**
   * Keyed by the timestamp of the week's first day (Monday).
   * Populated by computeMonthLayouts() after the grid or events change.
   */
  private weekLayoutMap = new Map<number, MonthLayoutItem<CalendarEventUI>[]>();

  // =========================
  // LIFECYCLE
  // =========================

  constructor(
    private calendarService: CalendarService,
    private dialog: MatDialog,
    private notificationService: NotificationRealtimeService,
    private snackBar: MatSnackBar,
    private authService: AuthService,
    private zone: NgZone
  ) { }

  ngOnInit(): void {
    const activeId = this.authService.getUserId();
    if (activeId) {
      this.userId = activeId;
    }
    this.generateCurrentView();
    this.fetchEvents();
    this.updateNowIndicator();
    this.nowTimer = setInterval(() => this.updateNowIndicator(), 60_000);
    this.listenForLiveReminders();
  }

  private listenForLiveReminders(): void {
    this.reminderSubscription = this.notificationService.reminders$.subscribe({
      next: (reminder) => {
        this.displayInteractiveReminder(reminder.message, reminder.eventId);
      },
      error: (err) => console.error('Real-time channel broadcast error:', err)
    });
  }

  private displayInteractiveReminder(message: string, eventId: number): void {
    // Force execution back inside the Angular Zone to guarantee immediate UI rendering
    this.zone.run(() => {
      const snackBarRef = this.snackBar.open(message, 'View Event', {
        duration: 10000,
        horizontalPosition: 'right',
        verticalPosition: 'top',
        panelClass: ['reminder-snackbar']
      });

      snackBarRef.onAction().subscribe(() => {
        this.openEventById(eventId);
      });
    });
  }

  private openEventById(eventId: number): void {
    // Find the target layout model configuration from local memory state
    const matchedEvent = this.events.find(e => e.id === eventId);
    if (matchedEvent) {
      this.openDialog(matchedEvent);
    } else {
      // Fallback: If event is out of scope in current month viewport, pull fresh data and display
      console.log(`Event item context #${eventId} out of date viewport scope.`);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.nowTimer);
  }

  updateNowIndicator(): void {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    this.nowIndicatorTop = (minutes / 60) * this.HOUR_HEIGHT;
  }

  // =========================
  // VIEW MODE
  // =========================

  setViewMode(mode: CalendarViewMode): void {
    this.viewMode = mode;
    this.generateCurrentView();
  }

  generateCurrentView(): void {
    switch (this.viewMode) {
      case 'month': this.generateCalendarGrid(); break;
      case 'week': this.generateWeekView(); break;
      case 'day': this.generateDayView(); break;
      case 'agenda': this.generateAgendaView(); break;
    }
  }

  generateWeekView(): void {
    const current = new Date(this.selectedDate);
    const day = (current.getDay() + 6) % 7;
    current.setDate(current.getDate() - day);

    this.weekViewDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(current);
      d.setDate(current.getDate() + i);
      return d;
    });
  }

  generateDayView(): void {
    const dayEvents = this.getEventsForDay(this.selectedDate);
    const normalized = EventNormalizer.normalize(dayEvents);

    this.dayViewBlocks = TimeBlockLayoutEngine.generate(normalized).map(layout => ({
      ...layout.event,
      top: layout.top,
      height: layout.height,
      left: layout.left,
      width: layout.width,
      overlapIndex: layout.lane,
      overlapCount: layout.laneCount,
    }));
  }

  generateAgendaView(): void {
    const groups: AgendaDayGroup[] = [];

    for (let i = 0; i < this.AGENDA_DAYS; i++) {
      const date = new Date(this.selectedDate);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + i);

      const events = this.getEventsForDay(date)
        .slice()
        .sort((a, b) => {
          if (a.allDayEvent && !b.allDayEvent) return -1;
          if (!a.allDayEvent && b.allDayEvent) return 1;
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });

      if (events.length > 0) {
        groups.push({ date, events });
      }
    }

    this.agendaDayGroups = groups;
  }

  getWeekDayLayouts(date: Date): CalendarTimeBlock[] {
    const events = this.getEventsForDay(date);
    const normalized = EventNormalizer.normalize(events);

    return TimeBlockLayoutEngine.generate(normalized).map(layout => ({
      ...layout.event,
      top: layout.top,
      height: layout.height,
      left: layout.left,
      width: layout.width,
      overlapIndex: layout.lane,
      overlapCount: layout.laneCount,
    }));
  }

  // =========================
  // FETCH EVENTS
  // =========================

  fetchEvents(): void {
    let start: Date;
    let end: Date;

    switch (this.viewMode) {

      case 'month':
        start = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1);
        end = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + 1, 1);
        break;

      case 'week':
        start = new Date(this.weekViewDates[0]);
        end = new Date(this.weekViewDates[6]);
        end.setDate(end.getDate() + 1);
        break;

      case 'day':
        start = new Date(this.selectedDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(this.selectedDate);
        end.setHours(23, 59, 59, 999);
        break;

      default:
        start = new Date();
        end = new Date();
        break;
    }

    this.calendarService.getEvents(start, end).subscribe(
      (events: any[]) => {
        this.events = events.map(event => ({
          ...event,
          startDate: this.convertToLocalDate(event.startDate),
          endDate: this.convertToLocalDate(event.endDate),
          eventTypeName: event.eventTypeName,
          eventColor: event.eventColor,
          attendanceScore: event.attendanceScore,
        }));

        this.generateCurrentView();
      },
      error => console.error('Error fetching events:', error)
    );
  }

  convertToLocalDate(utcString: string): Date {
    return new Date(utcString);
  }

  // =========================
  // MONTH VIEW
  // =========================

  generateCalendarGrid(): void {
    const year = this.selectedDate.getFullYear();
    const month = this.selectedDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const startDay = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = lastOfMonth.getDate();
    const prevMonthLast = new Date(year, month, 0).getDate();

    this.calendarGrid = [];
    let row: Date[] = [];

    // Days from previous month
    for (let i = startDay - 1; i >= 0; i--) {
      row.push(new Date(year, month - 1, prevMonthLast - i));
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      row.push(new Date(year, month, day));
      if (row.length === 7) {
        this.calendarGrid.push(row);
        row = [];
      }
    }

    // Pad with next-month days
    let nextMonthDay = 1;
    while (row.length > 0 && row.length < 7) {
      row.push(new Date(year, month + 1, nextMonthDay++));
    }
    if (row.length) {
      this.calendarGrid.push(row);
    }

    this.computeMonthLayouts();
  }

  // ── Month layout helpers ───────────────────────────────────────────────────

  private computeMonthLayouts(): void {
    this.weekLayoutMap.clear();
    for (const week of this.calendarGrid) {
      this.weekLayoutMap.set(
        week[0].getTime(),
        MonthLayoutEngine.generate(this.events, week)
      );
    }
  }

  getWeekLayout(week: Date[]): MonthLayoutItem<CalendarEventUI>[] {
    return this.weekLayoutMap.get(week[0].getTime()) ?? [];
  }

  getHiddenCountForDay(date: Date, week: Date[]): number {
    const dayMs = this.toDateOnly(date);
    const weekStartMs = this.toDateOnly(week[0]);
    const colIdx = Math.floor((dayMs - weekStartMs) / DateUtils.DAY_MS) + 1;

    return this.getWeekLayout(week).filter(item =>
      item.lane >= this.MAX_VISIBLE_LANES &&
      item.columnStart <= colIdx &&
      (item.columnStart + item.columnSpan - 1) >= colIdx
    ).length;
  }

  // =========================
  // DATE HELPERS
  // =========================

  getEventsForDay(date: Date): CalendarEventUI[] {
    const day = this.toDateOnly(date);

    return this.events.filter(event => {
      const start = this.toDateOnly(new Date(event.startDate));
      const end = this.toDateOnly(new Date(event.endDate));
      return start <= day && end >= day;
    });
  }

  getTooltip(event: CalendarEventUI): string {
    let base = event.eventTypeName
      ? `${event.subject} — ${event.eventTypeName}`
      : event.subject;

    if (event.attendanceScore != null) {
      const label = this.attendanceLabel(event.attendanceScore);
      base += `\nAttendance: ${label} (${(event.attendanceScore * 100).toFixed(0)}%)`;
    }

    return base;
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  getWeekNumber(date: Date): number {
    const targetDate = new Date(date.getTime());
    targetDate.setDate(targetDate.getDate() + 3 - ((targetDate.getDay() + 6) % 7));

    const firstThursday = new Date(targetDate.getFullYear(), 0, 4);
    firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));

    const diff = targetDate.getTime() - firstThursday.getTime();
    return 1 + Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
  }

  getDayOfYear(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff =
      date.getTime() -
      startOfYear.getTime() +
      (startOfYear.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  toDateOnly(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  isSameDate(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  // =========================
  // NAVIGATION
  // =========================

  onDateSelectedFromPicker(date: Date): void {
    this.selectedDate = date;
    this.generateCurrentView();
    this.fetchEvents();
  }

  goToPreviousMonth(): void {
    switch (this.viewMode) {
      case 'month':
        this.selectedDate = new Date(
          this.selectedDate.getFullYear(),
          this.selectedDate.getMonth() - 1,
          1
        );
        break;
      case 'week':
        this.selectedDate = new Date(this.selectedDate);
        this.selectedDate.setDate(this.selectedDate.getDate() - 7);
        break;
      case 'day':
        this.selectedDate = new Date(this.selectedDate);
        this.selectedDate.setDate(this.selectedDate.getDate() - 1);
        break;
    }
    this.generateCurrentView();
    this.fetchEvents();
  }

  goToNextMonth(): void {
    switch (this.viewMode) {
      case 'month':
        this.selectedDate = new Date(
          this.selectedDate.getFullYear(),
          this.selectedDate.getMonth() + 1,
          1
        );
        break;
      case 'week':
        this.selectedDate = new Date(this.selectedDate);
        this.selectedDate.setDate(this.selectedDate.getDate() + 7);
        break;
      case 'day':
        this.selectedDate = new Date(this.selectedDate);
        this.selectedDate.setDate(this.selectedDate.getDate() + 1);
        break;
    }
    this.generateCurrentView();
    this.fetchEvents();
  }

  goToToday(): void {
    this.selectedDate = new Date();
    this.generateCurrentView();
    this.fetchEvents();
  }

  // =========================
  // EVENT INTERACTIONS
  // =========================

  onEmptyDayClicked(date: Date): void {
    this.selectedDate = date;
    this.openDialog(null);
  }

  onEventClicked(event: any, e: MouseEvent): void {
    e.stopPropagation();
    this.selectedDate = new Date(event.startDate);
    this.openDialog(event);
  }

  onMoreClicked(date: Date, week: Date[], e: MouseEvent): void {
    e.stopPropagation();

    const dayMs = this.toDateOnly(date);
    const weekStartMs = this.toDateOnly(week[0]);
    const colIdx = Math.floor((dayMs - weekStartMs) / DateUtils.DAY_MS) + 1;

    this.selectedMoreEvents = this.getWeekLayout(week)
      .filter(item =>
        item.lane >= this.MAX_VISIBLE_LANES &&
        item.columnStart <= colIdx &&
        (item.columnStart + item.columnSpan - 1) >= colIdx
      )
      .map(item => item.event);

    this.selectedMoreDate = date;
  }

  openDialog(eventData: any = null): void {
    const dialogRef = this.dialog.open(CalendarDialogComponent, {
      width: '70%',
      height: '80vh',
      maxWidth: 'none',
      disableClose: true,
      data: { date: this.selectedDate, eventData },
    });

    // ── Save handler ─────────────────────────────────────────────────────────
    dialogRef.componentInstance.onSave.subscribe(({ record, attachments }: SavePayload) => {

      const recurrenceScope = record.recurrenceScope as RecurrenceUpdateScope | null;

      // =========================================================
      // RECURRING EVENT UPDATE
      // =========================================================

      if (record.isRecurring && record.id && recurrenceScope) {

        const save$ = this.buildOccurrenceSave(record, recurrenceScope);

        this.executeSave(save$, record, attachments, dialogRef);
        return;
      }

      // =========================================================
      // NORMAL EVENT CREATE / UPDATE
      // =========================================================

      const save$ = record.id
        ? this.calendarService.updateEvent(record.id, record)
        : this.calendarService.saveEvent(record);

      this.executeSave(save$, record, attachments, dialogRef);
    });

    // ── Cancel handler ────────────────────────────────────────────────────────
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
    dialogRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') attemptClose();
    });
  }

  // =========================
  // RECURRENCE SAVE HELPERS
  // =========================

  private buildOccurrenceSave(
    record: any,
    scope: RecurrenceUpdateScope
  ): Observable<any> {

    const occurrenceDate =
      record.originalOccurrenceDate
        ? new Date(record.originalOccurrenceDate).toISOString()
        : new Date(record.startDate).toISOString();

    switch (scope) {

      // =====================================================
      // THIS OCCURRENCE ONLY
      // =====================================================

      case 'this':

        return this.calendarService.updateSingleOccurrence({
          seriesUid: record.seriesUid,
          occurrenceDate,

          subject: record.subject,
          comment: record.comment,

          startDate: new Date(record.startDate).toISOString(),
          endDate: new Date(record.endDate).toISOString(),

          location: record.location,

          eventTypeId: record.eventTypeId,

          isCancelled: false
        });

      // =====================================================
      // THIS + FOLLOWING
      // =====================================================

      case 'thisAndFollowing':

        return this.calendarService.updateFromOccurrence({
          seriesUid: record.seriesUid,
          occurrenceDate,

          subject: record.subject,
          comment: record.comment,

          startDate: new Date(record.startDate).toISOString(),
          endDate: new Date(record.endDate).toISOString(),

          location: record.location
        });

      // =====================================================
      // ALL PRESERVE
      // =====================================================

      case 'allPreserve':

        return this.calendarService.updateSeriesPreserveExceptions({
          seriesUid: record.seriesUid,

          subject: record.subject,
          comment: record.comment,

          location: record.location,

          recurrenceRuleJson: record.recurrenceRuleJson
        });

      // =====================================================
      // ALL OVERRIDE
      // =====================================================

      case 'allOverride':

        return this.calendarService.updateSeriesOverrideAll({
          seriesUid: record.seriesUid,

          subject: record.subject,
          comment: record.comment,

          location: record.location,

          recurrenceRuleJson: record.recurrenceRuleJson
        });

      default:
        throw new Error(`Unsupported recurrence scope: ${scope}`);
    }
  }

  private executeSave(
    save$: Observable<any>,
    record: any,
    attachments: File[],
    dialogRef: any
  ): void {
    save$.subscribe({
      next: (savedEvent: any) => {
        const isOccurrence =
          !!record.seriesUid &&
          record.id !== record.baseEventId;
        const eventId = isOccurrence ? record.baseEventId : savedEvent?.id;

        if (attachments?.length > 0 && eventId) {
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

  // =========================
  // MISC
  // =========================

  formatHour(hour: number): string {
    if (hour === 0) return '00:00';
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  startDrag(
    e: MouseEvent,
    block: CalendarTimeBlock,
    date: Date
  ): void {

    e.preventDefault();
    e.stopPropagation();

    this.dragSession = {
      event: block,
      startMouseY: e.clientY,
      startMouseX: e.clientX,
      originalStart: new Date(block.startDate),
      originalEnd: new Date(block.endDate),
      originalTop: block.top,
      sourceDate: date,
    };

    window.addEventListener('mousemove', this.onDragging);
    window.addEventListener('mouseup', this.stopDrag);
  }

  onDragging = (e: MouseEvent): void => {

    if (!this.dragSession) return;

    const deltaY =
      e.clientY - this.dragSession.startMouseY;

    const minuteDelta =
      EventDragEngine.calculateMinuteDelta(deltaY);

    const updated =
      EventDragEngine.moveDates(
        this.dragSession.originalStart,
        this.dragSession.originalEnd,
        minuteDelta
      );

    const sourceEvent = this.events.find(
      x => x.id === this.dragSession!.event.id
    );

    if (!sourceEvent) return;

    sourceEvent.startDate = updated.start;
    sourceEvent.endDate = updated.end;

    this.generateCurrentView();
  };

  stopDrag = (): void => {

    if (!this.dragSession) return;

    const updatedEvent = this.events.find(
      x => x.id === this.dragSession!.event.id
    );

    if (!updatedEvent) return;

    // =====================================================
    // RECURRING EVENT
    // =====================================================

    if (updatedEvent.isRecurring) {

      const occurrenceDate = new Date(
        this.dragSession.originalStart
      ).toISOString();

      this.calendarService.updateSingleOccurrence({
        seriesUid: updatedEvent.seriesUid,
        occurrenceDate,

        subject: updatedEvent.subject,
        comment: updatedEvent.comment,

        startDate: new Date(updatedEvent.startDate).toISOString(),
        endDate: new Date(updatedEvent.endDate).toISOString(),

        location: updatedEvent.location,
        eventTypeId: updatedEvent.eventTypeId,

        isCancelled: false
      })
        .subscribe({
          next: () => this.fetchEvents(),
          error: err => console.error('Failed to update recurring drag event', err)
        });

    } else {

      // =====================================================
      // NORMAL EVENT
      // =====================================================

      this.calendarService.updateEvent(updatedEvent.id, updatedEvent)
        .subscribe({
          next: () => this.fetchEvents(),
          error: err => console.error('Failed to update dragged event', err)
        });
    }

    this.dragSession = null;

    window.removeEventListener('mousemove', this.onDragging);
    window.removeEventListener('mouseup', this.stopDrag);
  }

  startResize(
    e: MouseEvent,
    block: CalendarTimeBlock,
    direction: 'top' | 'bottom'
  ): void {

    e.preventDefault();
    e.stopPropagation();

    this.resizeSession = {
      event: block,
      direction,
      startMouseY: e.clientY,
      originalStart: new Date(block.startDate),
      originalEnd: new Date(block.endDate),
      originalTop: block.top,
      originalHeight: block.height,
    };

    window.addEventListener('mousemove', this.onResizing);
    window.addEventListener('mouseup', this.stopResize);
  }

  onResizing = (e: MouseEvent): void => {

    if (!this.resizeSession) return;

    const deltaY =
      e.clientY - this.resizeSession.startMouseY;

    const updated =
      this.resizeSession.direction === 'top'
        ? EventResizeEngine.resizeTop(
          this.resizeSession.originalStart,
          this.resizeSession.originalEnd,
          deltaY
        )
        : EventResizeEngine.resizeBottom(
          this.resizeSession.originalStart,
          this.resizeSession.originalEnd,
          deltaY
        );

    const sourceEvent = this.events.find(
      x => x.id === this.resizeSession!.event.id
    );

    if (!sourceEvent) return;

    sourceEvent.startDate = updated.start;
    sourceEvent.endDate = updated.end;

    this.generateCurrentView();
  };

  stopResize = (): void => {

    if (!this.resizeSession) return;

    const updatedEvent = this.events.find(
      x => x.id === this.resizeSession!.event.id
    );

    if (!updatedEvent) return;

    // =====================================================
    // RECURRING EVENT
    // =====================================================

    if (updatedEvent.isRecurring) {

      const occurrenceDate = new Date(
        this.resizeSession.originalStart
      ).toISOString();

      this.calendarService.updateSingleOccurrence({
        seriesUid: updatedEvent.seriesUid,
        occurrenceDate,

        subject: updatedEvent.subject,
        comment: updatedEvent.comment,

        startDate: new Date(updatedEvent.startDate).toISOString(),
        endDate: new Date(updatedEvent.endDate).toISOString(),

        location: updatedEvent.location,
        eventTypeId: updatedEvent.eventTypeId,

        isCancelled: false
      })
        .subscribe({
          next: () => this.fetchEvents(),
          error: err => console.error('Failed to resize recurring event', err)
        });

    } else {

      this.calendarService.updateEvent(updatedEvent.id, updatedEvent)
        .subscribe({
          next: () => this.fetchEvents(),
          error: err => console.error('Failed to resize event', err)
        });
    }

    this.resizeSession = null;

    window.removeEventListener('mousemove', this.onResizing);
    window.removeEventListener('mouseup', this.stopResize);
  }
}