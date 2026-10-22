import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  TemplateRef,
  ViewChild
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  ASK_REPLY_COUNTER_FROM,
  ASK_REPLY_MAX_LENGTH,
  AskReply,
  AskState,
  BoardItemAsk,
  ReplySegment,
  parseReplyBody,
  replyExcerpt
} from '../../models/board-item-ask.model';

export interface ReplyEdit {
  reply: AskReply;
  body: string;
}

/** How long "Copied" shows after copying a code block. */
export const COPIED_FEEDBACK_MS = 1_500;

/**
 * The replies on one ask and the box to reply, chat-like and plain text: text inside ``` fences
 * shows as a code block with a Copy button. The panel sends the requests; this keeps the draft,
 * which survives the panel's reloads, and clears it only when told the reply was saved.
 */
@Component({
  selector: 'app-ask-thread',
  imports: [NgTemplateOutlet, TextFieldModule, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './ask-thread.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './ask-thread.component.css'
})
export class AskThreadComponent implements OnChanges {
  @Input({ required: true }) ask!: BoardItemAsk;
  /** The panel's time template: relative within a day, with the exact time on hover. */
  @Input({ required: true }) when!: TemplateRef<unknown>;
  @Input() busy = false;
  /** The viewer is the recipient and may mark the ask done (or accept and mark it done) now. */
  @Input() canSendAndComplete = false;
  /** Mark done was clicked without a reply: offer to send one with it, or to go ahead without. */
  @Input() completePrompt = false;
  /** The other side of the ask, whom a reply goes to: the box's accessible name. */
  @Input() replyToName = '';

  @Output() send = new EventEmitter<string>();
  @Output() sendAndComplete = new EventEmitter<string>();
  @Output() completeWithoutReply = new EventEmitter<void>();
  @Output() promptClosed = new EventEmitter<void>();
  @Output() editReply = new EventEmitter<ReplyEdit>();

  @ViewChild('box') private box?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('editBox') private editBox?: ElementRef<HTMLTextAreaElement>;

  readonly AskState = AskState;
  readonly maxLength = ASK_REPLY_MAX_LENGTH;
  readonly counterFrom = ASK_REPLY_COUNTER_FROM;

  draft = '';
  /** Every reply shown, not only the latest. */
  showEarlier = false;
  /** A Done ask's replies opened from their one-line summary. */
  unfolded = false;

  editingId: number | null = null;
  editDraft = '';

  copiedKey: string | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly segmentCache = new Map<string, ReplySegment[]>();

  ngOnChanges(changes: SimpleChanges): void {
    const prompt = changes['completePrompt'];
    if (prompt?.currentValue && !prompt.previousValue) {
      // After this change is rendered, so the box exists.
      setTimeout(() => this.focusBox());
    }
  }

  // ---- What shows ---------------------------------------------------------------------------

  get isFolded(): boolean {
    return this.ask.state === AskState.Completed && !this.unfolded && this.ask.replies.length > 0;
  }

  get visibleReplies(): AskReply[] {
    const replies = this.ask.replies;
    return this.showEarlier ? replies : replies.slice(-1);
  }

  get hiddenCount(): number {
    return this.ask.replies.length - this.visibleReplies.length;
  }

  /** The answer a Done ask folds to: the recipient's latest reply, or else the latest one. */
  get foldReply(): AskReply {
    const replies = this.ask.replies;
    return [...replies].reverse().find(r => r.authorUserId === this.ask.recipientUserId) ?? replies[replies.length - 1];
  }

  get foldLabel(): string {
    if (this.foldReply.authorUserId === this.ask.recipientUserId) return 'Answered:';
    const count = this.ask.replies.length;
    return count === 1 ? '1 reply:' : `${count} replies:`;
  }

  get foldExcerpt(): string {
    return replyExcerpt(this.foldReply.body);
  }

  get hasText(): boolean {
    return this.draft.trim().length > 0;
  }

  segmentsOf(reply: AskReply): ReplySegment[] {
    let segments = this.segmentCache.get(reply.body);
    if (!segments) {
      segments = parseReplyBody(reply.body);
      this.segmentCache.set(reply.body, segments);
    }
    return segments;
  }

  // ---- The reply box ------------------------------------------------------------------------

  onDraftInput(value: string): void {
    this.draft = value;
  }

  onBoxKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (this.completePrompt) {
        this.emitSendAndComplete();
      } else {
        this.emitSend();
      }
    } else if (event.key === 'Escape' && this.completePrompt) {
      // Esc closes the prompt only; the item dialog around the panel would close on it too.
      event.preventDefault();
      event.stopPropagation();
      this.promptClosed.emit();
    }
  }

  emitSend(): void {
    if (this.hasText && !this.busy) this.send.emit(this.draft.trim());
  }

  emitSendAndComplete(): void {
    if (this.hasText && !this.busy) this.sendAndComplete.emit(this.draft.trim());
  }

  /** Called by the panel once the reply is saved. */
  clearDraft(): void {
    this.draft = '';
    this.showEarlier = false;
  }

  focusBox(): void {
    this.box?.nativeElement.focus();
  }

  // ---- Editing ------------------------------------------------------------------------------

  startEdit(reply: AskReply): void {
    this.editingId = reply.id;
    this.editDraft = reply.body;
    // Once the editor is rendered: the cursor goes to the end of the text, ready to change it.
    setTimeout(() => {
      const editor = this.editBox?.nativeElement;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  }

  cancelEdit(): void {
    this.editingId = null;
  }
  saveEdit(reply: AskReply): void {
    const body = this.editDraft.trim();
    if (!body || this.busy) return;
    this.editReply.emit({ reply, body });
  }

  onEditKeydown(event: KeyboardEvent, reply: AskReply): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.saveEdit(reply);
    } else if (event.key === 'Escape') {
      // Esc cancels the edit only, not the item dialog around the panel.
      event.preventDefault();
      event.stopPropagation();
      this.cancelEdit();
    }
  }

  /** Called by the panel once the edit is saved. */
  finishEdit(): void {
    this.editingId = null;
  }

  // ---- Copy ---------------------------------------------------------------------------------

  copy(text: string, key: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.copiedKey = key;
      if (this.copiedTimer !== null) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => {
        this.copiedKey = null;
        this.copiedTimer = null;
      }, COPIED_FEEDBACK_MS);
    }).catch(() => {
      // Clipboard access refused (insecure context or permission): the text is still selectable.
    });
  }
}
