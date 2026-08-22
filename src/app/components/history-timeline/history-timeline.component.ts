import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { ActivityService } from '../../_services/activity.service';
import { ActivityLogEntry } from '../../models/activity-log.model';
import { toLocalDate } from '../../shared/utils/date.utils';

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
