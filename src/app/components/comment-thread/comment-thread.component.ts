import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { CommentService } from '../../_services/comment.service';
import { AuthService } from '../../_services/auth.service';
import { Comment } from '../../models/comment.model';
import { toLocalDate } from '../../shared/utils/date.utils';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { CommentComposerComponent } from '../comment-composer/comment-composer.component';

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

  submitTopLevel(payload: { bodyHtml: string; mentionedUserIds: string[] }): void {
    this.commentService.createComment({
      entityType: this.entityType,
      entityId: this.entityId,
      parentCommentId: null,
      ...payload
    }).subscribe(created => this.comments = [...this.comments, created]);
  }

  startReply(comment: Comment): void {
    this.editingId = null;
    this.replyingToId = comment.id;
  }

  cancelReply(): void {
    this.replyingToId = null;
  }

  submitReply(parentId: number, payload: { bodyHtml: string; mentionedUserIds: string[] }): void {
    this.commentService.createComment({
      entityType: this.entityType,
      entityId: this.entityId,
      parentCommentId: parentId,
      ...payload
    }).subscribe(created => {
      this.comments = [...this.comments, created];
      this.replyingToId = null;
    });
  }

  startEdit(comment: Comment): void {
    this.replyingToId = null;
    this.editingId = comment.id;
  }

  cancelEdit(): void {
    this.editingId = null;
  }

  submitEdit(comment: Comment, payload: { bodyHtml: string; mentionedUserIds: string[] }): void {
    this.commentService.updateComment(comment.id, payload).subscribe(updated => {
      this.comments = this.comments.map(c => c.id === updated.id ? updated : c);
      this.editingId = null;
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
