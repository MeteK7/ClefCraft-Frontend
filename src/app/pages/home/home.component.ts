import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { CalendarService } from '../../_services/calendar.service';
import { BoardService } from '../../_services/board.service';
import { AuthService } from '../../_services/auth.service';

import { CalendarDialogComponent } from '../calendar-dialog/calendar-dialog.component';
import { ItemDetailDialogComponent } from '../item-detail-dialog/item-detail-dialog.component';

import { CalendarEventUI } from '../../models/calendar-event.model-ui';
import { Item } from '../../models/board.model';
import { forkJoin, of, switchMap, map } from 'rxjs';

interface DueItem {
  item: Item;
  boardId: number;
  boardTitle: string;
}

const UPCOMING_WINDOW_DAYS = 7;
const MAX_UPCOMING_EVENTS = 5;
const MAX_DUE_ITEMS = 8;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, MatDialogModule, MatIconModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  userFullName = '';
  isAdmin = false;

  upcomingEvents: CalendarEventUI[] = [];
  isLoadingEvents = false;

  dueItems: DueItem[] = [];
  isLoadingDueItems = false;

  constructor(
    private calendarService: CalendarService,
    private boardService: BoardService,
    private authService: AuthService,
    private dialog: MatDialog,
  ) {
    this.isAdmin = this.authService.hasRole('Administrator');
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.userFullName = user?.fullName ?? '';
    });

    this.loadUpcomingEvents();
    this.loadDueItems();
  }

  private loadUpcomingEvents(): void {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + UPCOMING_WINDOW_DAYS);

    this.isLoadingEvents = true;
    this.calendarService.getEvents(start, end).subscribe({
      next: (events: any[]) => {
        this.upcomingEvents = events
          .map(event => ({
            ...event,
            startDate: new Date(event.startDate),
            endDate: new Date(event.endDate),
          }))
          .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
          .slice(0, MAX_UPCOMING_EVENTS);
        this.isLoadingEvents = false;
      },
      error: err => {
        console.error('Error fetching upcoming events:', err);
        this.isLoadingEvents = false;
      },
    });
  }

  private loadDueItems(): void {
    const userId = this.authService.getUserId();

    this.isLoadingDueItems = true;
    this.boardService.getBoards().pipe(
      switchMap(boards => {
        if (!boards.length) return of([] as DueItem[][]);
        return forkJoin(
          boards.map(board =>
            this.boardService.getBoardItemsByBoardId(board.id).pipe(
              map((columns): DueItem[] =>
                columns
                  .flatMap(column => column.boardItems)
                  .map(item => ({ item, boardId: board.id, boardTitle: board.title })),
              ),
            ),
          ),
        );
      }),
      map((perBoard: DueItem[][]) => perBoard.flat()),
    ).subscribe({
      next: (entries: DueItem[]) => {
        // TODO: no backend endpoint exists yet for "my due items across boards" —
        // this aggregates client-side by fetching every board's items.
        this.dueItems = entries
          .filter(entry => entry.item.dueDate && entry.item.assigneeId === userId)
          .sort((a, b) => new Date(a.item.dueDate!).getTime() - new Date(b.item.dueDate!).getTime())
          .slice(0, MAX_DUE_ITEMS);
        this.isLoadingDueItems = false;
      },
      error: err => {
        console.error('Error fetching due items:', err);
        this.isLoadingDueItems = false;
      },
    });
  }

  isOverdue(dueDate: Date | string | undefined): boolean {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dueDate) < today;
  }

  openEvent(event: CalendarEventUI): void {
    const dialogRef = this.dialog.open(CalendarDialogComponent, {
      width: '70%',
      height: '80vh',
      maxWidth: 'none',
      disableClose: true,
      data: { date: event.startDate, eventData: event },
    });

    dialogRef.componentInstance.onCancel.subscribe(() => dialogRef.close());
  }

  openItem(entry: DueItem): void {
    this.dialog.open(ItemDetailDialogComponent, {
      width: '900px',
      height: '100vh',
      maxHeight: '90vh',
      maxWidth: '95vw',
      autoFocus: false,
      data: { item: entry.item, boardId: entry.boardId, columns: [] },
    });
  }
}
