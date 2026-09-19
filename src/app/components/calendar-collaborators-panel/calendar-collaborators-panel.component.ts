import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CalendarService } from '../../_services/calendar.service';
import { CalendarEventCollaborator } from '../../models/calendar-event-collaborator.model';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

// Shown on a CalendarEvent's Comments tab. Collaborators can only be added by mentioning
// someone (see CommentThreadComponent's confirm-before-share flow) — this panel is read-only
// discovery plus the owner's remove action, never a place to add someone directly.
@Component({
  selector: 'app-calendar-collaborators-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, UserAvatarComponent],
  templateUrl: './calendar-collaborators-panel.component.html',
  styleUrl: './calendar-collaborators-panel.component.css'
})
export class CalendarCollaboratorsPanelComponent implements OnChanges {
  @Input() eventId!: number;
  @Input() isOwner = false;
  /** Bumped by the parent whenever a new grant happens elsewhere, to trigger a refetch. */
  @Input() refreshToken = 0;

  @Output() collaboratorsLoaded = new EventEmitter<CalendarEventCollaborator[]>();

  collaborators: CalendarEventCollaborator[] = [];
  loading = false;

  constructor(private calendarService: CalendarService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['eventId'] || changes['refreshToken']) {
      this.load();
    }
  }

  private load(): void {
    if (!this.eventId) return;

    this.loading = true;
    this.calendarService.getCollaborators(this.eventId).subscribe({
      next: collaborators => {
        this.collaborators = collaborators;
        this.loading = false;
        this.collaboratorsLoaded.emit(collaborators);
      },
      error: () => this.loading = false
    });
  }

  removeCollaborator(collaborator: CalendarEventCollaborator): void {
    if (!window.confirm(`Remove ${collaborator.fullName}'s access to this event and its comments?`)) return;

    this.calendarService.removeCollaborator(this.eventId, collaborator.userId).subscribe(() => {
      this.collaborators = this.collaborators.filter(c => c.userId !== collaborator.userId);
      this.collaboratorsLoaded.emit(this.collaborators);
    });
  }
}
