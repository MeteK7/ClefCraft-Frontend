import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { ActivityService } from '../../_services/activity.service';
import { ActivityLogEntry } from '../../models/activity-log.model';
import { Assignee } from '../../models/assignee.model';
import { Column, Priority, Status } from '../../models/board.model';
import { toLocalDate } from '../../shared/utils/date.utils';
import { DisplayActivityChange, toDisplayChange } from '../../shared/utils/activity-log-display.utils';

@Component({
  selector: 'app-history-timeline',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './history-timeline.component.html',
  styleUrl: './history-timeline.component.css'
})
export class HistoryTimelineComponent implements OnInit {
  @Input() entityType!: string;
  @Input() entityId!: number;

  @Input() assignees: Assignee[] = [];
  @Input() columns: Column[] = [];
  @Input() statuses: Status[] = [];
  @Input() priorities: Priority[] = [];

  entries: ActivityLogEntry[] = [];
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

    this.activityService.getActivityLog(this.entityType, this.entityId, this.pageNumber, this.pageSize)
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

  localTimestamp(entry: ActivityLogEntry): Date {
    return toLocalDate(entry.timestamp);
  }

  displayChanges(entry: ActivityLogEntry): DisplayActivityChange[] {
    return entry.changes.map(change => toDisplayChange(change, {
      assignees: this.assignees,
      columns: this.columns,
      statuses: this.statuses,
      priorities: this.priorities
    }));
  }

  actionLabel(actionType: string): string {
    switch (actionType) {
      case 'CREATED':
        return 'created this item';
      case 'UPDATED':
        return 'updated this item';
      case 'DELETED':
        return 'deleted this item';
      default:
        return actionType
          .toLowerCase()
          .replace(/_/g, ' ')
          .replace(/^./, c => c.toUpperCase());
    }
  }
}
