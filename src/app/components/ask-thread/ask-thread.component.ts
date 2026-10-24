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
  AskViewpoint,
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

/** A thread longer than this opens on its latest replies, with the earlier ones a click away. */
export const THREAD_VISIBLE_LIMIT = 10;

/** An answer longer than this (or with more lines) is clamped until "Show more". */
const ANSWER_CLAMP_CHARS = 240;
const ANSWER_CLAMP_LINES = 3;

let nextThreadId = 0;

/**
 * One ask's answer and conversation. Closed, the toggle row shows the reply count and the latest
 * reply; a Done ask's shows the answer in its place among the replies instead, the ones around it
 * counted. One click opens the whole thread, where the answer is tagged in place. Plain text only: ``` fences show as code blocks with a Copy button. The reply
 * box shows with the open conversation, on Reply, in the mark-done prompt, or always for the
 * recipient of an open ask. The panel sends the requests; this keeps the draft and what's open,
 * which survive the panel's reloads.
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
  /** The viewer's side of the ask: which replies sit offset, and whose names show. */
  @Input() viewpoint: AskViewpoint = 'other';
  /** The panel's time template: relative within a day, with the exact time on hover. */
  @Input({ required: true }) when!: TemplateRef<unknown>;
  @Input() busy = false;
  /** The viewer is the recipient and may mark the ask done (or accept and mark it done) now. */
  @Input() canSendAndComplete = false;
  /** Mark done was clicked without a reply: offer to send one with it, or to go ahead without. */
  @Input() completePrompt = false;
  /** The other side of the ask, whom a reply goes to: the box's accessible name. */
  @Input() replyToName = '';
  /** The box shows even with the conversation closed: the recipient of an open ask, whose job is to reply. */
  @Input() boxByDefault = false;

  @Output() send = new EventEmitter<string>();
  @Output() sendAndComplete = new EventEmitter<string>();
  @Output() completeWithoutReply = new EventEmitter<void>();
  @Output() promptClosed = new EventEmitter<void>();
  @Output() editReply = new EventEmitter<ReplyEdit>();

  @ViewChild('box') private box?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('editBox') private editBox?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('toggleButton') private toggleButton?: ElementRef<HTMLButtonElement>;

  readonly AskState = AskState;
  readonly maxLength = ASK_REPLY_MAX_LENGTH;
  readonly counterFrom = ASK_REPLY_COUNTER_FROM;

  readonly threadId = `ask-thread-${nextThreadId++}`;

  draft = '';
  /** The conversation is open. */
  expanded = false;
  /** In a long open thread, the earlier replies are shown too. */
  showAll = false;
  /** Reply was pressed: the box shows although the conversation is closed. */
  boxRequested = false;
  /** A long answer shown in full. */
  answerExpanded = false;

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

  /** The reply that answered the ask, once it's done with one. */
  get answer(): AskReply | null {
    const id = this.ask.answerReplyId;
    return id == null ? null : this.ask.replies.find(r => r.id === id) ?? null;
  }

  /** The answer block shows on a Done ask with an answer, while the conversation is closed. */
  get showsAnswerBlock(): boolean {
    return this.ask.state === AskState.Completed && !!this.answer && !this.expanded;
  }

  get answerIsLong(): boolean {
    const body = this.answer?.body ?? '';
    return body.length > ANSWER_CLAMP_CHARS || body.split('\n').length > ANSWER_CLAMP_LINES;
  }

  get latest(): AskReply {
    return this.ask.replies[this.ask.replies.length - 1];
  }

  /** Every reply, the answer included: exactly what opening the conversation shows. */
  get countLabel(): string {
    const count = this.ask.replies.length;
    return count === 1 ? '1 reply' : `${count} replies`;
  }

  // The closed conversation of a done ask: [N earlier] · answer · [M more] · latest.

  get answerIndex(): number {
    return this.ask.replies.findIndex(r => r.id === this.ask.answerReplyId);
  }

  get repliesBeforeAnswer(): number {
    return Math.max(this.answerIndex, 0);
  }

  /** Between the answer and the latest reply, neither counted. */
  get repliesBetweenAnswerAndLatest(): number {
    return Math.max(this.ask.replies.length - this.answerIndex - 2, 0);
  }

  get latestIsAnswer(): boolean {
    return this.latest.id === this.ask.answerReplyId;
  }

  gapLabel(count: number, side: 'earlier' | 'more'): string {
    return `${count} ${side} ${count === 1 ? 'reply' : 'replies'}`;
  }

  get latestExcerpt(): string {
    return replyExcerpt(this.latest.body, 80);
  }

  get visibleReplies(): AskReply[] {
    const replies = this.ask.replies;
    return this.showAll || replies.length <= THREAD_VISIBLE_LIMIT ? replies : replies.slice(-THREAD_VISIBLE_LIMIT);
  }

  get hiddenCount(): number {
    return this.ask.replies.length - this.visibleReplies.length;
  }

  /** How an author is named in text: "You" for the viewer's own replies. */
  authorLabel(reply: AskReply): string {
    return reply.isMine ? 'You' : reply.authorFullName;
  }

  /**
   * The reply sits offset, on the conversation's right: the viewer's own when they're one of the
   * two sides; for anyone else, the requester's (a fixed rule, since they have no side of their own).
   */
  isOffset(reply: AskReply): boolean {
    return this.viewpoint === 'other' ? reply.authorUserId === this.ask.requestedByUserId : reply.isMine;
  }

  /**
   * The first of the visible replies, or by someone other than the reply before it. A run names
   * its author once, here ("You" for the viewer); the rest name them to screen readers only.
   */
  startsRun(index: number): boolean {
    const replies = this.visibleReplies;
    return index === 0 || replies[index - 1].authorUserId !== replies[index].authorUserId;
  }

  /** The last of the visible replies, or followed by someone else's. */
  endsRun(index: number): boolean {
    const replies = this.visibleReplies;
    return index === replies.length - 1 || replies[index + 1].authorUserId !== replies[index].authorUserId;
  }

  get boxVisible(): boolean {
    return this.ask.canReply && (this.expanded || this.boxRequested || this.boxByDefault || this.completePrompt);
  }

  toggle(): void {
    this.expanded = !this.expanded;
    // Closing the conversation closes a box opened with Reply too (its draft is kept).
    if (!this.expanded) {
      this.showAll = false;
      this.boxRequested = false;
    }
  }

  /**
   * A count in the closed conversation was clicked: open it all. The count goes with the closed
   * view, so focus moves to the toggle, which now reads "Hide conversation".
   */
  openConversation(): void {
    this.expanded = true;
    this.showAll = true;
    setTimeout(() => this.toggleButton?.nativeElement.focus());
  }

  /** The Reply action: open the conversation (if there is one) and the box, ready to type. */
  openReply(): void {
    if (this.ask.replies.length > 0) this.expanded = true;
    this.boxRequested = true;
    setTimeout(() => this.focusBox());
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
    } else if (event.key === 'Escape' && this.boxRequested && !this.expanded && !this.boxByDefault) {
      // A box opened with Reply closes again on Esc (its draft is kept); not the dialog.
      event.preventDefault();
      event.stopPropagation();
      this.boxRequested = false;
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
