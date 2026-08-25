import { Component, Input, OnInit } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { ActivityService } from '../../_services/activity.service';
import { CalendarActivityLogEntry } from '../../models/calendar-activity-log.model';
import { EventType } from '../../models/event-type.model';
import { toLocalDate } from '../../shared/utils/date.utils';
import { DisplayActivityChange } from '../../shared/utils/activity-log-display.utils';
import { toCalendarDisplayChanges } from '../../shared/utils/calendar-activity-log-display.utils';

@Component({
  selector: 'app-calendar-history-timeline',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './calendar-history-timeline.component.html',
  styleUrl: './calendar-history-timeline.component.css'
})
export class CalendarHistoryTimelineComponent implements OnInit {
  @Input() eventId!: number;
  @Input() seriesUid?: string | null;
  @Input() eventTypes: EventType[] = [];

  entries: CalendarActivityLogEntry[] = [];
  loading = false;
  error = false;
  hasMore = false;

  private pageNumber = 1;
  private readonly pageSize = 20;

  constructor(private activityService: ActivityService) { }

  ngOnInit(): void {
    this.loadActivity();
  }

  loadActivity(append = false): void {
    this.loading = true;
    this.error = false;

    this.activityService.getCalendarEventActivity(this.eventId, this.seriesUid, this.pageNumber, this.pageSize)
      .subscribe({
        next: result => {
          this.entries = append ? [...this.entries, ...result.items] : result.items;
          this.hasMore = result.hasMore;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.error = true;
        }
      });
  }

  loadMore(): void {
    this.pageNumber++;
    this.loadActivity(true);
  }

  retry(): void {
    this.pageNumber = 1;
    this.loadActivity();
  }

  localTimestamp(entry: CalendarActivityLogEntry): Date {
    return toLocalDate(entry.timestamp);
  }

  displayChanges(entry: CalendarActivityLogEntry): DisplayActivityChange[] {
    return toCalendarDisplayChanges(entry.changes, { eventTypes: this.eventTypes });
  }

  /**
   * A short label distinguishing which part of the recurrence model this entry describes.
   * Only meaningful for Segment/Exception scope — "Event" scope is the universal baseline every
   * event (recurring or not) always has, so it's deliberately left unbadged in the template
   * rather than given a label here (there's nothing to distinguish it from when it's the only
   * scope present, which is every non-recurring event, always).
   */
  scopeLabel(entry: CalendarActivityLogEntry): string {
    switch (entry.scope) {
      case 'Segment':
        return entry.effectiveFrom
          ? `Recurring settings, from ${formatDate(toLocalDate(entry.effectiveFrom), 'mediumDate', 'en-US')}`
          : 'Recurring settings';
      case 'Exception':
        return entry.occurrenceDate
          ? `This occurrence, ${formatDate(toLocalDate(entry.occurrenceDate), 'mediumDate', 'en-US')}`
          : 'This occurrence';
      default:
        return '';
    }
  }

  actionLabel(actionType: string): string {
    switch (actionType) {
      case 'CREATED':
        return 'created';
      case 'UPDATED':
        return 'updated';
      case 'DELETED':
        return 'deleted';
      default:
        return actionType
          .toLowerCase()
          .replace(/_/g, ' ')
          .replace(/^./, c => c.toUpperCase());
    }
  }
}
