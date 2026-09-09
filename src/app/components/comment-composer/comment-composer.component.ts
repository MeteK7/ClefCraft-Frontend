import { afterNextRender, Component, ElementRef, EventEmitter, Injector, Input, OnInit, Output, ViewChild } from '@angular/core';
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
  /** Rests as a compact pill until focused; collapses back down when left empty. Used for the
   *  always-visible top-level composer, not for reply/edit (which already appear only on demand
   *  and already have an explicit Cancel). */
  @Input() collapsible = false;

  expanded = false;

  @ViewChild('composerRoot') composerRoot?: ElementRef<HTMLElement>;

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

  constructor(private commentService: CommentService, private injector: Injector) { }

  ngOnInit(): void {
    this.bodyControl.setValue(this.initialBodyHtml ?? '');

    this.commentService.getMentionableUsers(this.entityType, this.entityId)
      .subscribe(users => this.mentionableUsers = users);
  }

  get hasContent(): boolean {
    const plain = (this.bodyControl.value || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    return plain.length > 0;
  }

  get isCollapsed(): boolean {
    return this.collapsible && !this.expanded && !this.hasContent;
  }

  onEditorFocus(): void {
    this.expanded = true;
  }

  onComposerClick(): void {
    if (!this.isCollapsed) return;

    this.expanded = true;
    afterNextRender(() => {
      this.composerRoot?.nativeElement.querySelector<HTMLElement>('.ql-editor')?.focus();
    }, { injector: this.injector });
  }

  onEditorBlur(): void {
    // A draft in progress is never hidden — only rest back to the pill once it's genuinely empty.
    if (!this.hasContent) this.expanded = false;
  }

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
    this.expanded = false;
  }

  onCancel(): void {
    if (this.hasContent && !window.confirm('Discard this draft?')) return;

    this.cancelled.emit();
    this.bodyControl.setValue('');
    this.expanded = false;
  }
}
