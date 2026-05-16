import { Component, OnInit, OnDestroy } from '@angular/core';
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
import { CalendarViewMode } from './types/calendar-view-mode.type';
import { CalendarEventUI } from './models/calendar-event.model-ui';
import { CalendarTimeBlock } from './models/calendar-time-block.model';
import { SavePayload } from './models/save-payload.model';

import { EventNormalizer } from '../../calendar-engine/utils/event-normalizer';
import { TimeBlockLayoutEngine } from '../../calendar-engine/layout/time-block-layout-engine';
import { MonthLayoutEngine, MonthLayoutItem } from '../../calendar-engine/layout/month-layout-engine';
import { DateUtils } from '../../calendar-engine/utils/date.utils';

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
  ],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent implements OnInit, OnDestroy {

  events: CalendarEventUI[] = [];

  selectedDate: Date = new Date();

  linkedRecord: Item | null = null;

  userId: string = '944d0156-cb3d-466f-a1ea-5f53e3a10f8e';

  calendarGrid: Date[][] = [];

  weekdays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  readonly MAX_VISIBLE_LANES = 3;

  selectedMoreEvents: CalendarEventUI[] = [];
  selectedMoreDate: Date | null = null;

  attendanceLabel = getAttendanceLabel;
  attendanceColor = getAttendanceColor;

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
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.generateCurrentView();
    this.fetchEvents();
    this.updateNowIndicator();
    this.nowTimer = setInterval(() => this.updateNowIndicator(), 60_000);
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
      case 'week':  this.generateWeekView();     break;
      case 'day':   this.generateDayView();      break;
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
    const dayEvents  = this.getEventsForDay(this.selectedDate);
    const normalized = EventNormalizer.normalize(dayEvents);

    this.dayViewBlocks = TimeBlockLayoutEngine.generate(normalized).map(layout => ({
      ...layout.event,
      top:    layout.top,
      height: layout.height,
      left:   layout.left,
      width:  layout.width,
      overlapIndex: layout.lane,
      overlapCount: layout.laneCount,
    }));
  }

  getWeekDayLayouts(date: Date): CalendarTimeBlock[] {
    const events     = this.getEventsForDay(date);
    const normalized = EventNormalizer.normalize(events);

    return TimeBlockLayoutEngine.generate(normalized).map(layout => ({
      ...layout.event,
      top:    layout.top,
      height: layout.height,
      left:   layout.left,
      width:  layout.width,
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
        end   = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + 1, 1);
        break;

      case 'week':
        start = new Date(this.weekViewDates[0]);
        end   = new Date(this.weekViewDates[6]);
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
        end   = new Date();
        break;
    }

    this.calendarService.getEvents(start, end).subscribe(
      (events: any[]) => {
        this.events = events.map(event => ({
          ...event,
          startDate:     this.convertToLocalDate(event.startDate),
          endDate:       this.convertToLocalDate(event.endDate),
          eventTypeName: event.eventTypeName,
          eventColor:    event.eventColor,
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
    const year  = this.selectedDate.getFullYear();
    const month = this.selectedDate.getMonth();

    const firstOfMonth   = new Date(year, month, 1);
    const lastOfMonth    = new Date(year, month + 1, 0);
    const startDay       = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth    = lastOfMonth.getDate();
    const prevMonthLast  = new Date(year, month, 0).getDate();

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

    // (Re-)compute layout for all week rows now that both grid and events are set.
    this.computeMonthLayouts();
  }

  // ── Month layout helpers ───────────────────────────────────────────────────

  /**
   * Pre-computes MonthLayoutItem arrays for every week row in the grid.
   * Called after the grid is built and after events are (re-)fetched.
   */
  private computeMonthLayouts(): void {
    this.weekLayoutMap.clear();
    for (const week of this.calendarGrid) {
      this.weekLayoutMap.set(
        week[0].getTime(),
        MonthLayoutEngine.generate(this.events, week)
      );
    }
  }

  /**
   * Returns the pre-computed layout items for a week row.
   * O(1) – just a Map lookup.
   */
  getWeekLayout(week: Date[]): MonthLayoutItem<CalendarEventUI>[] {
    return this.weekLayoutMap.get(week[0].getTime()) ?? [];
  }

  /**
   * Returns the number of events hidden (lane ≥ MAX_VISIBLE_LANES) that
   * cover a specific day cell within the week.
   */
  getHiddenCountForDay(date: Date, week: Date[]): number {
    const dayMs      = this.toDateOnly(date);
    const weekStartMs = this.toDateOnly(week[0]);
    const colIdx     = Math.floor((dayMs - weekStartMs) / DateUtils.DAY_MS) + 1; // 1-based

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
      const end   = this.toDateOnly(new Date(event.endDate));
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
      date.getMonth()    === today.getMonth()    &&
      date.getDate()     === today.getDate()
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
      date1.getMonth()    === date2.getMonth()    &&
      date1.getDate()     === date2.getDate()
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

  /**
   * Populates the "more" popover with the hidden events for the clicked day.
   * Relies on the pre-computed week layout map — no re-sorting needed.
   */
  onMoreClicked(date: Date, week: Date[], e: MouseEvent): void {
    e.stopPropagation();

    const dayMs       = this.toDateOnly(date);
    const weekStartMs = this.toDateOnly(week[0]);
    const colIdx      = Math.floor((dayMs - weekStartMs) / DateUtils.DAY_MS) + 1;

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

    dialogRef.componentInstance.onSave.subscribe(({ record, attachments }: SavePayload) => {

      const isOccurrence = record.isRecurring && record.id !== record.baseEventId;

      const save$ = isOccurrence
        ? this.calendarService.updateSingleOccurrence({
            eventId:        record.baseEventId,
            occurrenceDate: record.startDate,
            subject:        record.subject,
            comment:        record.comment,
            startDate:      record.startDate,
            endDate:        record.endDate,
          })
        : record.id
          ? this.calendarService.updateEvent(record.id, record)
          : this.calendarService.saveEvent(record);

      save$.subscribe((savedEvent: any) => {
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
      });
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
    dialogRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') attemptClose();
    });
  }

  // =========================
  // MISC
  // =========================

  formatHour(hour: number): string {
    if (hour === 0) return '00:00';
    return `${hour.toString().padStart(2, '0')}:00`;
  }
}
