import { Component, OnInit } from '@angular/core';
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
import { SavePayload } from './models/save-payload.model';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { getAttendanceColor, getAttendanceLabel } from '../../utils/attendance.utils';
import { CalendarViewMode } from './types/calendar-view-mode.type';
import { CalendarEventUI } from './models/calendar-event.model-ui';
import { CalendarTimeBlock } from './models/calendar-time-block.model';

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
export class CalendarComponent implements OnInit {

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

  dayViewEvents: CalendarEventUI[] = [];

  hours: number[] = Array.from({ length: 24 }, (_, i) => i);

  dayViewBlocks: CalendarTimeBlock[] = [];

  constructor(
    private calendarService: CalendarService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.generateCurrentView();
    this.fetchEvents();
  }

  // =========================
  // VIEW MODE METHODS
  // =========================

  setViewMode(mode: CalendarViewMode): void {
    this.viewMode = mode;
    this.generateCurrentView();
  }

  generateCurrentView(): void {

    switch (this.viewMode) {

      case 'month':
        this.generateCalendarGrid();
        break;

      case 'week':
        this.generateWeekView();
        break;

      case 'day':
        this.generateDayView();
        break;
    }
  }

  generateWeekView(): void {

    const current = new Date(this.selectedDate);

    const day = (current.getDay() + 6) % 7;

    current.setDate(current.getDate() - day);

    this.weekViewDates = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(current);
      d.setDate(current.getDate() + i);
      this.weekViewDates.push(d);
    }
  }

  generateDayView(): void {

    this.dayViewBlocks =
      this.getTimeBlocksForDay(this.selectedDate);
  }

  // =========================
  // FETCH EVENTS
  // =========================

  fetchEvents(): void {

    let start: Date;
    let end: Date;

    switch (this.viewMode) {

      case 'month':

        start = new Date(
          this.selectedDate.getFullYear(),
          this.selectedDate.getMonth(),
          1
        );

        end = new Date(
          this.selectedDate.getFullYear(),
          this.selectedDate.getMonth() + 1,
          1
        );

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
          attendanceScore: event.attendanceScore
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

    this.calendarGrid = [];

    let row: Date[] = [];

    const prevMonthLastDay = new Date(year, month, 0).getDate();

    for (let i = startDay - 1; i >= 0; i--) {
      row.push(new Date(year, month - 1, prevMonthLastDay - i));
    }

    for (let day = 1; day <= daysInMonth; day++) {

      row.push(new Date(year, month, day));

      if (row.length === 7) {
        this.calendarGrid.push(row);
        row = [];
      }
    }

    let nextMonthDay = 1;

    while (row.length > 0 && row.length < 7) {
      row.push(new Date(year, month + 1, nextMonthDay++));
    }

    if (row.length) {
      this.calendarGrid.push(row);
    }
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

    return date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
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

  onDateSelectedFromPicker(date: Date): void {

    this.selectedDate = date;

    this.generateCurrentView();

    this.fetchEvents();
  }

  onEmptyDayClicked(date: Date): void {

    this.selectedDate = date;

    this.openDialog(null);
  }

  onEventClicked(event: any, e: MouseEvent): void {

    e.stopPropagation();

    this.selectedDate = new Date(event.startDate);

    this.openDialog(event);
  }

  openDialog(eventData: any = null): void {

    const dialogRef = this.dialog.open(CalendarDialogComponent, {
      width: '70%',
      height: '80vh',
      maxWidth: 'none',
      disableClose: true,
      data: {
        date: this.selectedDate,
        eventData
      }
    });

    dialogRef.componentInstance.onSave.subscribe(
      ({ record, attachments }: SavePayload) => {

        const isOccurrence = record.isRecurring && record.id !== record.baseEventId;

        const save$ = isOccurrence
          ? this.calendarService.updateSingleOccurrence({
            eventId: record.baseEventId,
            occurrenceDate: record.startDate,
            subject: record.subject,
            comment: record.comment,
            startDate: record.startDate,
            endDate: record.endDate,
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
          }
          else {
            this.fetchEvents();
          }

          dialogRef.close();
        });
      });

    dialogRef.componentInstance.onCancel.subscribe(() => dialogRef.close());

    const attemptClose = () => {
      const hasChanges = dialogRef.componentInstance.hasUnsavedChanges;

      if (!hasChanges) {
        dialogRef.close();
        return;
      }

      const confirm = window.confirm(
        'You have unsaved changes.\n\nDiscard them?'
      );

      if (confirm) {
        dialogRef.close();
      }
    };

    // BACKDROP
    dialogRef.backdropClick().subscribe(() => {
      attemptClose();
    });

    // ESC
    dialogRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') {
        attemptClose();
      }
    });
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
        this.selectedDate.setDate(this.selectedDate.getDate() - 7);
        this.selectedDate = new Date(this.selectedDate);
        break;

      case 'day':
        this.selectedDate.setDate(this.selectedDate.getDate() - 1);
        this.selectedDate = new Date(this.selectedDate);
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
        this.selectedDate.setDate(this.selectedDate.getDate() + 7);
        this.selectedDate = new Date(this.selectedDate);
        break;

      case 'day':
        this.selectedDate.setDate(this.selectedDate.getDate() + 1);
        this.selectedDate = new Date(this.selectedDate);
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

  isSameDate(date1: Date, date2: Date): boolean {

    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  }

  getEventsForWeek(week: Date[]): CalendarEventUI[] {

    const weekStart = this.toDateOnly(week[0]);
    const weekEnd = this.toDateOnly(week[6]);

    return this.events.filter(e => {

      const start = this.toDateOnly(new Date(e.startDate));

      let end = this.toDateOnly(new Date(e.endDate));

      if (e.allDayEvent) {
        end -= (1000 * 60 * 60 * 24);
      }

      return start <= weekEnd && end >= weekStart;
    });
  }

  getEventColumnStart(event: CalendarEventUI, week: Date[]): number {

    const start = this.toDateOnly(new Date(event.startDate));

    const weekStart = this.toDateOnly(new Date(week[0]));

    const effectiveStart = Math.max(start, weekStart);

    const diffDays = Math.floor(
      (effectiveStart - weekStart) / (1000 * 60 * 60 * 24)
    );

    return diffDays + 1;
  }

  getEventSpan(event: CalendarEventUI, week: Date[]): number {

    const start = this.toDateOnly(new Date(event.startDate));

    let end = this.toDateOnly(new Date(event.endDate));

    if (event.allDayEvent) {
      end -= (1000 * 60 * 60 * 24);
    }

    const weekStart = this.toDateOnly(new Date(week[0]));

    const weekEnd = this.toDateOnly(new Date(week[6]));

    const effectiveStart = Math.max(start, weekStart);

    const effectiveEnd = Math.min(end, weekEnd);

    const diff = Math.floor(
      (effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)
    );

    return diff + 1;
  }

  toDateOnly(date: Date): number {

    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ).getTime();
  }

  getEventRowIndex(
    event: CalendarEventUI,
    weekEvents: CalendarEventUI[],
    week: Date[]
  ): number {

    const lanes: CalendarEventUI[][] = [];

    const sorted = [...weekEvents].sort((a, b) =>
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    for (const e of sorted) {

      let placed = false;

      for (let i = 0; i < lanes.length; i++) {

        const lane = lanes[i];

        const overlaps = lane.some(existing =>
          this.eventsOverlap(existing, e, week)
        );

        if (!overlaps) {

          lane.push(e);

          placed = true;

          if (e.id === event.id) {
            return i;
          }

          break;
        }
      }

      if (!placed) {

        lanes.push([e]);

        if (e.id === event.id) {
          return lanes.length - 1;
        }
      }
    }

    return 0;
  }

  eventsOverlap(a: CalendarEventUI, b: CalendarEventUI, week: Date[]): boolean {

    const aStart = this.getEventColumnStart(a, week);
    const aEnd = aStart + this.getEventSpan(a, week) - 1;

    const bStart = this.getEventColumnStart(b, week);
    const bEnd = bStart + this.getEventSpan(b, week) - 1;

    return !(aEnd < bStart || bEnd < aStart);
  }

  getHiddenEventCountForDay(date: Date, week: Date[]): number {

    const day = this.toDateOnly(date);

    const weekEvents = this.getEventsForWeek(week);

    let hidden = 0;

    for (const event of weekEvents) {

      const lane = this.getEventRowIndex(event, weekEvents, week);

      if (lane < this.MAX_VISIBLE_LANES) {
        continue;
      }

      const start = this.toDateOnly(new Date(event.startDate));
      const end = this.toDateOnly(new Date(event.endDate));

      if (start <= day && end >= day) {
        hidden++;
      }
    }

    return hidden;
  }

  onMoreClicked(date: Date, week: Date[], event: MouseEvent): void {

    event.stopPropagation();

    const weekEvents = this.getEventsForWeek(week);

    this.selectedMoreEvents = weekEvents.filter(e => {

      const lane = this.getEventRowIndex(e, weekEvents, week);

      const start = this.toDateOnly(new Date(e.startDate));
      const end = this.toDateOnly(new Date(e.endDate));
      const day = this.toDateOnly(date);

      return lane >= this.MAX_VISIBLE_LANES && start <= day && end >= day;
    });

    this.selectedMoreDate = date;
  }

  formatHour(hour: number): string {

    if (hour === 0) return '00:00';

    return `${hour.toString().padStart(2, '0')}:00`;
  }

  getTimeBlocksForDay(date: Date): CalendarTimeBlock[] {

    const events = this.getEventsForDay(date)
      .filter(e => !e.allDayEvent)
      .sort((a, b) =>
        new Date(a.startDate).getTime() -
        new Date(b.startDate).getTime()
      );

    const blocks: CalendarTimeBlock[] = [];

    const HOUR_HEIGHT = 80;

    for (let i = 0; i < events.length; i++) {

      const event = events[i];

      const start = new Date(event.startDate);
      const end = new Date(event.endDate);

      const startMinutes =
        start.getHours() * 60 + start.getMinutes();

      const endMinutes =
        end.getHours() * 60 + end.getMinutes();

      const duration = endMinutes - startMinutes;

      const top =
        (startMinutes / 60) * HOUR_HEIGHT;

      const height =
        (duration / 60) * HOUR_HEIGHT;

      const overlapping = events.filter(e => {

        if (e.id === event.id) return false;

        const s = new Date(e.startDate).getTime();
        const en = new Date(e.endDate).getTime();

        return start.getTime() < en &&
          end.getTime() > s;
      });

      const overlapCount = overlapping.length + 1;

      const overlapIndex = overlapping.filter(e =>
        new Date(e.startDate).getTime() <
        start.getTime()
      ).length;

      const width = 100 / overlapCount;

      const left = overlapIndex * width;

      blocks.push({
        ...event,
        top,
        height,
        overlapIndex,
        overlapCount,
        left,
        width
      });
    }

    return blocks;
  }
}