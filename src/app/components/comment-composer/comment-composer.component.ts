import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { QuillModule } from 'ngx-quill';
import 'quill-mention/autoregister';

import { CommentService } from '../../_services/comment.service';
import { MentionableUser } from '../../models/comment.model';
import { commentQuillModules } from '../../shared/quill-config';

@Component({
  selector: 'app-comment-composer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatButtonModule, QuillModule],
  templateUrl: './comment-composer.component.html',
  styleUrl: './comment-composer.component.css'
})
export class CommentComposerComponent implements OnInit {
  @Input() entityType!: string;
  @Input() entityId!: number;
  @Input() initialBodyHtml: string | null = null;
  @Input() placeholder = 'Write a comment...';
  @Input() submitLabel = 'Comment';
  @Input() showCancel = false;

  @Output() submitted = new EventEmitter<{
    bodyHtml: string;
    mentionedUserIds: string[];
    mentionedUsers: { userId: string; fullName: string }[];
  }>();
  @Output() cancelled = new EventEmitter<void>();

  bodyControl = new FormControl('');
  mentionableUsers: MentionableUser[] = [];

  // Built as a getter (not a shared constant) because the `mention` module's `source`
  // callback needs to close over this.mentionableUsers, which loads asynchronously.
  get quillModules() {
    return {
      ...commentQuillModules,
      mention: {
        allowedChars: /^[A-Za-z0-9_.\-\s]*$/,
        mentionDenotationChars: ['@'],
        source: (
          searchTerm: string,
          renderList: (matches: { id: string; value: string }[], searchTerm: string) => void
        ) => {
          const values = this.mentionableUsers.map(u => ({ id: u.userId, value: u.fullName }));
          renderList(
            searchTerm ? values.filter(v => v.value.toLowerCase().includes(searchTerm.toLowerCase())) : values,
            searchTerm
          );
        }
      }
    };
  }

  constructor(private commentService: CommentService) { }

  ngOnInit(): void {
    this.bodyControl.setValue(this.initialBodyHtml ?? '');

    this.commentService.getMentionableUsers(this.entityType, this.entityId)
      .subscribe(users => this.mentionableUsers = users);
  }

  get hasContent(): boolean {
    const plain = (this.bodyControl.value || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    return plain.length > 0;
  }

  // Mentions round-trip through the stored HTML itself (quill-mention's blot is recognized by
  // Quill's HTML matcher on load), so the authoritative mention list for a submission is
  // whatever ".mention[data-id]" elements are actually present in the final body — no separate
  // tracking of "which mentions were added this session" needed. data-value doubles as the
  // display name, so the same parse gives the parent everything it needs to build a
  // "this will share the event with X" confirmation without a second lookup.
  private extractMentions(html: string): { userId: string; fullName: string }[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const seen = new Set<string>();
    const mentions: { userId: string; fullName: string }[] = [];

    doc.querySelectorAll('.mention[data-id]').forEach(el => {
      const userId = el.getAttribute('data-id');
      if (!userId || seen.has(userId)) return;
      seen.add(userId);
      mentions.push({ userId, fullName: el.getAttribute('data-value') ?? userId });
    });

    return mentions;
  }

  onSubmit(): void {
    if (!this.hasContent) return;

    const bodyHtml = this.bodyControl.value || '';
    const mentionedUsers = this.extractMentions(bodyHtml);

    this.submitted.emit({ bodyHtml, mentionedUserIds: mentionedUsers.map(m => m.userId), mentionedUsers });

    this.bodyControl.setValue('');
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
