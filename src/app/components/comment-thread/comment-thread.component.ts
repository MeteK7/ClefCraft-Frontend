import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { CommentService } from '../../_services/comment.service';
import { AuthService } from '../../_services/auth.service';
import { Comment } from '../../models/comment.model';
import { toLocalDate } from '../../shared/utils/date.utils';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { CommentComposerComponent } from '../comment-composer/comment-composer.component';

type ComposerPayload = { bodyHtml: string; mentionedUserIds: string[]; mentionedUsers: { userId: string; fullName: string }[] };

@Component({
  selector: 'app-comment-thread',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, UserAvatarComponent, CommentComposerComponent],
  templateUrl: './comment-thread.component.html',
  styleUrl: './comment-thread.component.css'
})
export class CommentThreadComponent implements OnInit {
  @Input() entityType!: string;
  @Input() entityId!: number;
  /** set when opened from a mention notification — scrolls to and briefly highlights this comment */
  @Input() focusCommentId: number | null = null;

  // CalendarEvent-only: who owns the event, and who currently has collaborator access — used
  // to decide whether a mention is about to share the event with someone new, and if so, warn
  // before posting. Irrelevant (left undefined) for BoardItem, where board membership already
  // means everyone here can see everything and a mention is always just a ping.
  @Input() calendarEventOwnerUserId?: string;
  @Input() calendarCollaboratorUserIds: string[] = [];
  @Output() calendarCollaboratorsGranted = new EventEmitter<string[]>();

  comments: Comment[] = [];
  loading = false;
  error = false;
  hasMore = false;

  replyingToId: number | null = null;
  editingId: number | null = null;

  private pageNumber = 1;
  private readonly pageSize = 20;
  private readonly currentUserId: string | null;

  constructor(private commentService: CommentService, private authService: AuthService) {
    this.currentUserId = this.authService.getUserId();
  }

  ngOnInit(): void {
    this.loadComments();
  }

  loadComments(append = false): void {
    this.loading = true;
    this.error = false;

    this.commentService.getComments(this.entityType, this.entityId, this.pageNumber, this.pageSize)
      .subscribe({
        next: result => {
          this.comments = append ? [...this.comments, ...result.items] : result.items;
          this.hasMore = result.hasMore;
          this.loading = false;

          if (!append && this.focusCommentId != null) {
            this.scrollToFocusedComment();
          }
        },
        error: () => {
          this.loading = false;
          this.error = true;
        }
      });
  }

  loadMore(): void {
    this.pageNumber++;
    this.loadComments(true);
  }

  retry(): void {
    this.pageNumber = 1;
    this.loadComments();
  }

  get topLevelComments(): Comment[] {
    return this.comments.filter(c => c.parentCommentId === null);
  }

  repliesFor(commentId: number): Comment[] {
    return this.comments.filter(c => c.parentCommentId === commentId);
  }

  isOwn(comment: Comment): boolean {
    return !!this.currentUserId && comment.authorUserId === this.currentUserId;
  }

  localTimestamp(comment: Comment): Date | null {
    return comment.dateCreated ? toLocalDate(comment.dateCreated) : null;
  }

  /**
   * Only the event owner posting a mention can grant anyone anything (the backend silently
   * drops a non-owner's mention of someone new, so warning here would be misleading for them).
   * Returns `null` — abort the submit entirely — if the owner is warned and cancels; the
   * comment is not posted, so they can edit the mention out first rather than have it silently
   * stripped. Returns the confirmed new-share userIds (possibly empty) otherwise — the caller
   * emits calendarCollaboratorsGranted only once the actual API call that performs the grant
   * has succeeded, not here, so a sibling collaborators panel doesn't refetch before the grant
   * is actually persisted.
   */
  private confirmNewCalendarShares(mentionedUsers: { userId: string; fullName: string }[]): string[] | null {
    if (this.entityType !== 'CalendarEvent') return [];
    if (!this.calendarEventOwnerUserId || this.currentUserId !== this.calendarEventOwnerUserId) return [];

    const newShares = mentionedUsers.filter(m =>
      m.userId !== this.calendarEventOwnerUserId && !this.calendarCollaboratorUserIds.includes(m.userId));

    if (newShares.length === 0) return [];

    const names = newShares.map(m => m.fullName);
    const namesText = names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const pronoun = names.length === 1 ? namesText : 'them';

    const confirmed = window.confirm(
      `This calendar event is private. Mentioning ${namesText} will give ${pronoun} read-only access to the ` +
      `event and its existing comments. ${names.length === 1 ? namesText : 'They'} will also be able to ` +
      `participate in the comment section, but will not be able to edit the event itself.\n\nContinue?`
    );

    if (!confirmed) return null;

    // Optimistic local update so re-mentioning the same person later in this session doesn't
    // re-prompt before the parent's next refresh comes back.
    const newShareIds = newShares.map(m => m.userId);
    this.calendarCollaboratorUserIds = [...this.calendarCollaboratorUserIds, ...newShareIds];
    return newShareIds;
  }

  submitTopLevel(payload: ComposerPayload): void {
    const newShareIds = this.confirmNewCalendarShares(payload.mentionedUsers);
    if (newShareIds === null) return;

    this.commentService.createComment({
      entityType: this.entityType,
      entityId: this.entityId,
      parentCommentId: null,
      bodyHtml: payload.bodyHtml,
      mentionedUserIds: payload.mentionedUserIds
    }).subscribe(created => {
      this.comments = [...this.comments, created];
      if (newShareIds.length) this.calendarCollaboratorsGranted.emit(newShareIds);
    });
  }

  startReply(comment: Comment): void {
    this.editingId = null;
    this.replyingToId = comment.id;
  }

  cancelReply(): void {
    this.replyingToId = null;
  }

  submitReply(parentId: number, payload: ComposerPayload): void {
    const newShareIds = this.confirmNewCalendarShares(payload.mentionedUsers);
    if (newShareIds === null) return;

    this.commentService.createComment({
      entityType: this.entityType,
      entityId: this.entityId,
      parentCommentId: parentId,
      bodyHtml: payload.bodyHtml,
      mentionedUserIds: payload.mentionedUserIds
    }).subscribe(created => {
      this.comments = [...this.comments, created];
      this.replyingToId = null;
      if (newShareIds.length) this.calendarCollaboratorsGranted.emit(newShareIds);
    });
  }

  startEdit(comment: Comment): void {
    this.replyingToId = null;
    this.editingId = comment.id;
  }

  cancelEdit(): void {
    this.editingId = null;
  }

  submitEdit(comment: Comment, payload: ComposerPayload): void {
    const newShareIds = this.confirmNewCalendarShares(payload.mentionedUsers);
    if (newShareIds === null) return;

    this.commentService.updateComment(comment.id, {
      bodyHtml: payload.bodyHtml,
      mentionedUserIds: payload.mentionedUserIds
    }).subscribe(updated => {
      this.comments = this.comments.map(c => c.id === updated.id ? updated : c);
      this.editingId = null;
      if (newShareIds.length) this.calendarCollaboratorsGranted.emit(newShareIds);
    });
  }

  private scrollToFocusedComment(): void {
    // Only the currently-loaded page is searched — if the target comment is further back than
    // the first page, this is a no-op rather than an automatic backfill fetch.
    setTimeout(() => {
      const el = document.getElementById(`comment-${this.focusCommentId}`);
      if (!el) return;

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('comment-highlighted');
      setTimeout(() => el.classList.remove('comment-highlighted'), 2500);
    });
  }

  deleteComment(comment: Comment): void {
    if (!window.confirm('Delete this comment?')) return;

    this.commentService.deleteComment(comment.id).subscribe(() => {
      comment.isDeleted = true;
      comment.bodyHtml = null;
      comment.mentionedUserIds = [];
    });
  }
}
