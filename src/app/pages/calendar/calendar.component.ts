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
import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { getAttendanceColor, getAttendanceLabel } from '../../utils/attendance.utils';

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
  userId: string = '944d0156-cb3d-466f-a1ea-5f53e3a10f8e';  // TEST
  calendarGrid: Date[][] = [];
  weekdays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly MAX_VISIBLE_LANES = 3;
  selectedMoreEvents: CalendarEventUI[] = [];
  selectedMoreDate: Date | null = null;
  attendanceLabel = getAttendanceLabel;
  attendanceColor = getAttendanceColor;

  constructor(private calendarService: CalendarService, private dialog: MatDialog) { }

  ngOnInit(): void {
    this.fetchEvents();
    this.generateCalendarGrid();
  }

  fetchEvents(): void {
    const start = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1);
    const end = new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + 1, 0);

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
        this.generateCalendarGrid();
      },
      error => console.error('Error fetching events:', error)
    );
  }

  convertToLocalDate(utcString: string): Date {
    return new Date(utcString);
  }

  generateCalendarGrid(): void {
    const year = this.selectedDate.getFullYear();
    const month = this.selectedDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    const startDay = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = lastOfMonth.getDate();

    this.calendarGrid = [];
    let row: Date[] = [];

    // 🔹 Previous month filler
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      row.push(new Date(year, month - 1, prevMonthLastDay - i));
    }

    // 🔹 Current month
    for (let day = 1; day <= daysInMonth; day++) {
      row.push(new Date(year, month, day));
      if (row.length === 7) {
        this.calendarGrid.push(row);
        row = [];
      }
    }

    // 🔹 Next month filler
    let nextMonthDay = 1;
    while (row.length > 0 && row.length < 7) {
      row.push(new Date(year, month + 1, nextMonthDay++));
    }
    if (row.length) {
      this.calendarGrid.push(row);
    }
  }


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

  //CONSIDER USING THE CODE BELOW IF YOU WANT
  /*
    getEventsForDay(date: Date): any[] {
    return this.events.filter((event) => {
      const eventStart = new Date(event.startDate);
      const eventEnd = new Date(event.endDate);
  
      return (
        eventStart.getDate() <= date.getDate() &&
        eventEnd.getDate() >= date.getDate() &&
        eventStart.getMonth() === date.getMonth() &&
        eventStart.getFullYear() === date.getFullYear()
      );
    });
  }
  */

  // Get the ISO week number
  getWeekNumber(date: Date): number {
    // Get the Thursday of the current week to ensure correct ISO week calculation
    const targetDate = new Date(date.getTime());
    targetDate.setDate(targetDate.getDate() + 3 - ((targetDate.getDay() + 6) % 7));

    // Calculate the first Thursday of the year
    const firstThursday = new Date(targetDate.getFullYear(), 0, 4);
    firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));

    // Calculate the ISO week number
    const diff = targetDate.getTime() - firstThursday.getTime();
    return 1 + Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
  }

  // Get the day of the year
  getDayOfYear(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff =
      date.getTime() -
      startOfYear.getTime() +
      (startOfYear.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }


  // Datepicker now only navigates calendar
  onDateSelectedFromPicker(date: Date): void {
    this.selectedDate = date;
    this.generateCalendarGrid(); // Update calendar view to the selected month
  }

  onEmptyDayClicked(date: Date): void {
    this.selectedDate = date;       // Update selected date
    this.openDialog(null);          // Open dialog with no existing event (new event)
  }

  // Per-event click opens dialog
  onEventClicked(event: any, e: MouseEvent): void {
    e.stopPropagation(); // Prevent parent td click
    this.selectedDate = new Date(event.startDate); // Optional: update selected date
    this.openDialog(event);
  }

  openDialog(eventData: any = null): void {
    const dialogRef = this.dialog.open(CalendarDialogComponent, {
      width: '70%',
      height: '80vh',
      maxWidth: 'none', // Disable Angular Material's default max-width
      disableClose: true,
      data: {
        date: this.selectedDate,
        eventData
      }
    });

    dialogRef.componentInstance.onSave.subscribe(
      ({ record, attachments }: SavePayload) => {

        // A recurring occurrence has a virtual Id that differs from its real BaseEventId
        const isOccurrence = record.isRecurring && record.id !== record.baseEventId;

        const save$ = isOccurrence
          ? this.calendarService.updateSingleOccurrence({
            eventId: record.baseEventId,                           // real DB row
            occurrenceDate: record.startDate,                      // identifies which occurrence
            subject: record.subject,
            comment: record.comment,
            startDate: record.startDate,
            endDate: record.endDate,
          })
          : record.id
            ? this.calendarService.updateEvent(record.id, record)   // normal update
            : this.calendarService.saveEvent(record);               // create

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

  //When dealing with all-day events, it's critical to strip the time portion of the date to avoid timezone-related offsets.
  saveEvent(record: any): void {
    const event = {
      ...record,
      startDate: record.startDate
        ? new Date(record.startDate).toISOString()
        : null,
      endDate: record.endDate
        ? new Date(record.endDate).toISOString()
        : null
    };

    if (record.id) {
      // UPDATE
      this.calendarService.updateEvent(record.id, event).subscribe(
        () => this.fetchEvents(),
        err => console.error('Update failed', err)
      );
    } else {
      // CREATE
      this.calendarService.saveEvent(event).subscribe(
        () => this.fetchEvents(),
        err => console.error('Create failed', err)
      );
    }
  }

  navigateToBoard(): void {
    console.log('Navigating to the board...');
  }

  goToPreviousMonth(): void {
    const currentMonth = this.selectedDate.getMonth();
    const currentYear = this.selectedDate.getFullYear();
    this.selectedDate = new Date(currentYear, currentMonth - 1, 1);
    this.generateCalendarGrid();
  }

  goToNextMonth(): void {
    const currentMonth = this.selectedDate.getMonth();
    const currentYear = this.selectedDate.getFullYear();
    this.selectedDate = new Date(currentYear, currentMonth + 1, 1);
    this.generateCalendarGrid();
  }

  goToToday(): void {
    this.selectedDate = new Date();
    this.generateCalendarGrid();
  }

  handleDialogCancel(): void {
    console.log('Dialog canceled');
  }

  // Check if two dates are the same (ignoring time)
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

    // only subtract 1 day for ALL-DAY events
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
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  getEventRowIndex(event: CalendarEventUI, weekEvents: CalendarEventUI[], week: Date[]): number {

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

          if (e.id === event.id) return i;
          break;
        }
      }

      if (!placed) {
        lanes.push([e]);

        if (e.id === event.id) return lanes.length - 1;
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

      if (lane < this.MAX_VISIBLE_LANES) continue;

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
}
