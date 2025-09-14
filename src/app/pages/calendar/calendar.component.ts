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
    CalendarDialogComponent,
  ],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent implements OnInit {
  events: any[] = [];
  selectedDate: Date = new Date();
  linkedRecord: Item | null = null;
  userId: string = '944d0156-cb3d-466f-a1ea-5f53e3a10f8e';  // TEST
  calendarGrid: Date[][] = [];
  weekdays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  constructor(private calendarService: CalendarService, private dialog: MatDialog) { }

  ngOnInit(): void {
    this.fetchEvents();
    this.generateCalendarGrid();
  }

  fetchEvents(): void {
    this.calendarService.getEvents().subscribe(
      (events) => {
        this.events = events.map(event => ({
          ...event,
          startDate: this.convertToLocalDate(event.startDate),
          endDate: this.convertToLocalDate(event.endDate),
        }));
        this.generateCalendarGrid();
      },
      (error) => console.error('Error fetching events:', error)
    );
  }

  convertToLocalDate(utcDate: string): Date {
    const date = new Date(utcDate); // Parses as UTC
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000); // Convert to local time
  }


  generateCalendarGrid(): void {
    const currentMonth = this.selectedDate.getMonth();
    const currentYear = this.selectedDate.getFullYear();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const startDay = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();

    this.calendarGrid = [];
    let row: Date[] = [];

    // Fill first row with empty cells before the start of the month
    for (let i = 0; i < startDay; i++) {
      row.push(new Date(0)); // Empty date
    }

    // Fill the calendar grid with actual days
    for (let day = 1; day <= totalDays; day++) {
      row.push(new Date(currentYear, currentMonth, day));
      if (row.length === 7) {
        this.calendarGrid.push(row);
        row = [];
      }
    }

    // Push remaining days if any
    if (row.length > 0) {
      this.calendarGrid.push(row);
    }
  }

  getEventsForDay(date: Date): any[] {
    return this.events.filter((event) => {
      const eventDate = new Date(
        event.startDate.getFullYear(),
        event.startDate.getMonth(),
        event.startDate.getDate()
      );
      const selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      return eventDate.getTime() === selectedDate.getTime();
    });
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
      width: '70%', // Occupy the full screen width
      maxWidth: 'none', // Disable Angular Material's default max-width
      height: '80vh',
      data: {
        date: this.selectedDate,
        linkedRecord: this.linkedRecord,
        eventData: eventData, // Pass event data
      },
    });

    dialogRef.componentInstance.onSave.subscribe((record: any) => {
      this.saveEvent(record);
      dialogRef.close();
    });

    dialogRef.componentInstance.onCancel.subscribe(() => {
      dialogRef.close();
    });
  }

  //When dealing with all-day events, it's critical to strip the time portion of the date to avoid timezone-related offsets.
  saveEvent(record: any): void {
    const event = {
      ...record,
      startDate: new Date(record.startDate).toISOString(), // UTC
      endDate: new Date(record.endDate).toISOString(),
      dateCreated: new Date().toISOString(), // Ensure UTC
      dateModified: new Date().toISOString(), // Ensure UTC
    };

    this.calendarService.saveEvent(event).subscribe(
      (response) => {
        console.log('Event saved successfully:', response);
        this.fetchEvents();
      },
      (error) => console.error('Error saving event:', error)
    );
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

}
