import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  ViewChildren,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable, Subscription, filter } from 'rxjs';

import { BoardItemAskService } from '../../_services/board-item-ask.service';
import { AuthService } from '../../_services/auth.service';
import { NotificationRealtimeService } from '../../_services/notification-realtime.service';
import { OpenAskItemsService } from '../../_services/open-ask-items.service';
import { AskThreadComponent, ReplyEdit } from '../ask-thread/ask-thread.component';
import { Assignee } from '../../models/assignee.model';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog.component';
import { REASON_DIALOG_MESSAGE_ID, ReasonDialogComponent, ReasonDialogData } from '../reason-dialog/reason-dialog.component';
import {
  ASK_EXACT_TIME_FORMAT,
  ASK_RESPONSE_NOTE_MAX_LENGTH,
  AskAction,
  AskAttention,
  AskCancelReason,
  AskContributor,
  AskState,
  AskKeyDate,
  AskStatusPart,
  AskSummary,
  AskViewpoint,
  BoardItemAsk,
  NUDGE_RULE_TEXT,
  askDayFormat,
  askErrorMessage,
  askKeyDates,
  askStatusLine,
  askViewpoint,
  crossedThreshold,
  isAnswerRequiredError,
  isNudgeTooSoonError,
  isWithinDay,
  limitThresholds,
  isActiveAsk,
  newestFirst,
  timeAgo,
  toAskAttention,
  toAskSummary,
  toContributors,
  quotedNote
} from '../../models/board-item-ask.model';
import { toDueDate } from '../../relationship-engine/analytics/finish-before';
import { DATE_INPUT_PLACEHOLDER } from '../../date-format';

/** The note's limit, as the API enforces it (BoardItemAskLimits.NoteMaxLength). */
export const ASK_NOTE_MAX_LENGTH = 200;

/** Announced once each as typing reaches them: 20 characters left, then the limit. */
export const ASK_NOTE_LIMIT_THRESHOLDS = limitThresholds(ASK_NOTE_MAX_LENGTH, ASK_NOTE_MAX_LENGTH - 20);

let nextAsksPanelId = 0;

/** Shown when the server refuses a nudge inside the 24-hour cooldown. */
export const NUDGE_TOO_SOON_TEXT = 'Too soon to nudge again';

/**
 * The reload that re-enables Nudge after a cooldown runs a second after the cooldown ends by the
 * client clock, but never sooner than this: if the clocks disagree and the server still says
 * "not yet", the next try comes after this delay instead of in a tight loop.
 */
export const NUDGE_RELOAD_MIN_DELAY_MS = 5_000;
const NUDGE_RELOAD_MARGIN_MS = 1_000;

type AskFormMode =
  | { kind: 'create' }
  | { kind: 'edit'; ask: BoardItemAsk }
  | { kind: 'askAgain'; ask: BoardItemAsk }
  | { kind: 'reassign'; ask: BoardItemAsk };

interface ActionButton {
  action: AskAction;
  label: string;
  icon: string;
  /** Inline actions are the card's next steps; the rest wait in its "More actions" menu. */
  placement: 'inline' | 'menu';
  /** Shown apart and in the danger colour. */
  danger?: boolean;
}

/**
 * A button as shown for one ask. Two can show disabled, with the reason on hover: Nudge while its
 * cooldown runs, and Mark done while the ask expects an answer that hasn't been given.
 */
interface AskButton extends ActionButton {
  disabled: boolean;
}

/** The tooltip on Mark done while the ask expects an answer the recipient hasn't given. */
export const ANSWER_FIRST_TEXT = 'Reply with the answer first.';

// The buttons each allowed action gets, in display order. CompleteOnBehalf isn't a button: it is
// offered by the completion prompt only.
const ACTION_BUTTONS: ActionButton[] = [
  { action: AskAction.Accept, label: 'Accept', icon: 'check', placement: 'inline' },
  { action: AskAction.Decline, label: 'Decline', icon: 'close', placement: 'inline' },
  { action: AskAction.Complete, label: 'Mark done', icon: 'task_alt', placement: 'inline' },
  { action: AskAction.Reopen, label: 'Reopen', icon: 'replay', placement: 'inline' },
  { action: AskAction.Nudge, label: 'Nudge', icon: 'notifications', placement: 'inline' },
  { action: AskAction.AskAgain, label: 'Ask again', icon: 'forward_to_inbox', placement: 'inline' },
  { action: AskAction.Edit, label: 'Edit', icon: 'edit', placement: 'menu' },
  { action: AskAction.SetRequired, label: 'Make required', icon: 'flag', placement: 'menu' },
  { action: AskAction.WaiveRequirement, label: 'Waive requirement', icon: 'outlined_flag', placement: 'menu' },
  { action: AskAction.SetExpectsAnswer, label: 'Expect an answer', icon: 'quiz', placement: 'menu' },
  { action: AskAction.ClearExpectsAnswer, label: 'No answer needed', icon: 'speaker_notes_off', placement: 'menu' },
  { action: AskAction.Reassign, label: 'Ask someone else', icon: 'swap_horiz', placement: 'menu' },
  { action: AskAction.Cancel, label: 'Withdraw', icon: 'undo', placement: 'menu', danger: true }
];

const STATE_LABELS: Record<AskState, string> = {
  [AskState.Pending]: 'Waiting for an answer',
  [AskState.Accepted]: 'Accepted',
  [AskState.Declined]: 'Declined',
  [AskState.Completed]: 'Done',
  [AskState.Cancelled]: 'Cancelled'
};

/**
 * "Chime In": the item's asks, the actions the current user may take on each (exactly the
 * API's allowedActions) and the form to ask someone. Every change reloads the list, and every load
 * emits the card summary so the board stays current.
 */
@Component({
  selector: 'app-board-item-asks',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatDividerModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatTooltipModule,
    AskThreadComponent
  ],
  templateUrl: './board-item-asks.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './board-item-asks.component.css'
})
export class BoardItemAsksComponent implements OnInit, OnChanges, OnDestroy {
  @Input() itemId!: number;
  /** The item's saved assignee: already responsible, so not someone to ask. */
  @Input() assigneeId: string | null | undefined;
  /** The item's due date, for the "due after the item" warning. */
  @Input() itemDueDate: Date | string | null | undefined;
  /** The board's members, as the dialog already loaded them for the assignee picker. */
  @Input() members: Assignee[] = [];
  /** Offer to hide the panel (the item dialog shows it beside or under the item's fields). */
  @Input() hideable = false;
  /**
   * While true, realtime ask events for this item refresh the panel instead of raising toasts.
   * The dialog turns it off while the panel is hidden, so new asks and replies still get noticed.
   */
  @Input() suppressToasts = true;

  /** The hide button was pressed. */
  @Output() hide = new EventEmitter<void>();

  /**
   * Emits after every load. Asynchronous, because the parent dialog shows state derived from it:
   * a load that completes during the parent's change detection mustn't change what it just checked.
   */
  @Output() summaryChange = new EventEmitter<AskSummary>(true);

  /** Who helped with the item, after every load: asynchronous for the same reason as summaryChange. */
  @Output() contributorsChange = new EventEmitter<AskContributor[]>(true);

  /** How many asks are the viewer's move, after every load: asynchronous like summaryChange. */
  @Output() attentionChange = new EventEmitter<AskAttention>(true);

  /** "Full history" under an ask's Details: the item's History tab has every ask event. */
  @Output() openHistory = new EventEmitter<void>();

  @ViewChildren(AskThreadComponent) private threads?: QueryList<AskThreadComponent>;

  readonly AskState = AskState;
  readonly AskAction = AskAction;
  readonly noteMaxLength = ASK_NOTE_MAX_LENGTH;
  /** The note's counter: it describes the note field instead of sitting in a live region. */
  readonly noteCountId = `ask-note-count-${nextAsksPanelId++}`;
  /** The note's length as of the last input or fill, to announce each threshold once. */
  private noteLengthSeen = 0;
  /** The format "By when" reads, shown as its placeholder. */
  readonly dateFormat = DATE_INPUT_PLACEHOLDER;
  readonly nudgeRule = NUDGE_RULE_TEXT;
  readonly exactTimeFormat = ASK_EXACT_TIME_FORMAT;
  readonly answerFirst = ANSWER_FIRST_TEXT;

  /** The one pending reload that re-enables Nudge when a cooldown ends; null when none is due. */
  private nudgeReloadTimer: ReturnType<typeof setTimeout> | null = null;

  asks: BoardItemAsk[] = [];
  /** The rail's two lists, each newest first: active asks, then closed ones (isActiveAsk). */
  activeAsks: BoardItemAsk[] = [];
  closedAsks: BoardItemAsk[] = [];
  /** The closed list is folded until opened; the choice lasts while the dialog is open. */
  closedOpen = false;
  readonly closedListId = `ask-closed-${nextAsksPanelId++}`;
  readonly isActive = isActiveAsk;
  isLoading = false;
  isBusy = false;
  errorMessage: string | null = null;

  formMode: AskFormMode | null = null;
  form: FormGroup;

  /** The ask whose Mark done is waiting on "Send & mark done" or "Mark done without reply". */
  completePromptAskId: number | null = null;

  /** The asks whose Details (key dates) are open; kept across reloads by id. */
  private readonly detailsOpen = new Set<number>();

  private readonly currentUserId: string | null;
  private registeredItemId: number | null = null;
  private askEvents?: Subscription;

  constructor(
    private askService: BoardItemAskService,
    private dialog: MatDialog,
    private realtime: NotificationRealtimeService,
    private openAskItems: OpenAskItemsService,
    private host: ElementRef<HTMLElement>,
    private liveAnnouncer: LiveAnnouncer,
    private changeDetector: ChangeDetectorRef,
    authService: AuthService,
    fb: FormBuilder
  ) {
    this.currentUserId = authService.getUserId();
    this.form = fb.group({
      recipientUserId: [null as string | null, Validators.required],
      note: ['', [Validators.required, Validators.maxLength(ASK_NOTE_MAX_LENGTH)]],
      dueDate: [null as Date | null],
      isRequired: [false],
      expectsAnswer: [false]
    });
  }

  ngOnInit(): void {
    this.syncToastSuppression();
    // Someone else changed or replied to an ask on this item: show it now (and, while the panel
    // is visible, instead of a toast).
    this.askEvents = this.realtime.askEvents$.subscribe(event => {
      if (event.boardItemId === this.itemId) this.load();
    });
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Idempotent, so the first binding (before ngOnInit) is harmless.
    if (changes['suppressToasts']) {
      this.syncToastSuppression();
    }
    if (changes['itemId'] && !changes['itemId'].firstChange) {
      this.syncToastSuppression();
      this.load();
    }
  }

  ngOnDestroy(): void {
    if (this.revealTimer !== null) clearTimeout(this.revealTimer);
    this.clearNudgeReload();
    this.askEvents?.unsubscribe();
    this.unregisterItem();
  }

  /** Registers the item as on screen exactly while toasts for it should be suppressed. */
  private syncToastSuppression(): void {
    const wanted = this.suppressToasts && this.itemId ? this.itemId : null;
    if (wanted === this.registeredItemId) return;

    this.unregisterItem();
    if (wanted !== null) {
      this.openAskItems.register(wanted);
      this.registeredItemId = wanted;
    }
  }

  private unregisterItem(): void {
    if (this.registeredItemId !== null) {
      this.openAskItems.unregister(this.registeredItemId);
      this.registeredItemId = null;
    }
  }

  /** How long a card revealed from outside the panel stays highlighted. */
  static readonly REVEAL_HIGHLIGHT_MS = 1_600;

  /** The ask whose card was just revealed, highlighted briefly. */
  revealedAskId: number | null = null;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;

  /** Brings an ask's card into view and focuses it, e.g. from "Helped by" beside the item's fields. */
  revealAsk(askId: number): void {
    // A link (a toast, the tray, "Helped by") can point at a closed ask: unfold it first.
    if (!this.closedOpen && this.closedAsks.some(a => a.id === askId)) {
      this.closedOpen = true;
      this.changeDetector.detectChanges();
    }
    const card = this.host.nativeElement.querySelector<HTMLElement>(`[data-ask-id="${askId}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card.focus({ preventScroll: true });
    this.revealedAskId = askId;
    if (this.revealTimer !== null) clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => {
      this.revealedAskId = null;
      this.revealTimer = null;
    }, BoardItemAsksComponent.REVEAL_HIGHLIGHT_MS);
  }

  // ---- Loading ----------------------------------------------------------------------------

  load(): void {
    if (!this.itemId) return;

    this.isLoading = true;
    this.askService.getForItem(this.itemId).subscribe({
      next: asks => {
        const wasActive = new Map(this.asks.map(a => [a.id, isActiveAsk(a)]));
        const focusedAskId = this.focusedActiveCardAskId();
        // The server sends them oldest first; the rail shows the newest first.
        this.asks = newestFirst(asks);
        this.activeAsks = this.asks.filter(isActiveAsk);
        this.closedAsks = this.asks.filter(a => !isActiveAsk(a));
        this.isLoading = false;
        this.followCardThatClosed(focusedAskId, wasActive);
        this.summaryChange.emit(toAskSummary(asks));
        this.contributorsChange.emit(toContributors(asks));
        this.attentionChange.emit(toAskAttention(asks));
        this.scheduleNudgeReload();
      },
      error: error => {
        this.isLoading = false;
        this.errorMessage = askErrorMessage(error, 'The asks could not be loaded.');
      }
    });
  }

  toggleClosed(): void {
    this.closedOpen = !this.closedOpen;
  }

  /** The ask whose active card holds focus (the card or a control in it); null otherwise. */
  private focusedActiveCardAskId(): number | null {
    const card = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-ask-id]');
    if (!card || !this.host.nativeElement.contains(card) || card.closest(`#${this.closedListId}`)) return null;
    return Number(card.dataset['askId']);
  }

  /**
   * When the card holding focus has just moved from the active list to the closed one (it was
   * withdrawn, marked done or declined), focus follows instead of falling to the page: to the card
   * in its new place while the closed list is open, else to the "Closed · n" toggle. Announced
   * once, for that move only; any other reload leaves focus alone.
   */
  private followCardThatClosed(focusedAskId: number | null, wasActive: Map<number, boolean>): void {
    if (focusedAskId === null || wasActive.get(focusedAskId) !== true) return;
    if (!this.closedAsks.some(a => a.id === focusedAskId)) return;

    this.changeDetector.detectChanges();
    const target = this.closedOpen
      ? this.host.nativeElement.querySelector<HTMLElement>(`[data-ask-id="${focusedAskId}"]`)
      : this.host.nativeElement.querySelector<HTMLElement>('.asks-closed-toggle');
    target?.focus({ preventScroll: !this.closedOpen });
    this.liveAnnouncer.announce('Moved to closed asks', 'polite');
  }

  /**
   * While any ask is in a nudge cooldown, keeps exactly one reload pending: shortly after the
   * earliest cooldown ends, so the server's fresh allowedActions re-enable Nudge without the user
   * reloading. The client clock only decides when to ask; the server decides the answer. Each
   * reload reschedules from its own data, so a cooldown the server still reports (clock skew)
   * is tried again after the minimum delay, never in a tight loop.
   */
  private scheduleNudgeReload(): void {
    this.clearNudgeReload();

    const ends = this.asks
      .map(a => a.nextNudgeAt ? new Date(a.nextNudgeAt).getTime() : NaN)
      .filter(t => !isNaN(t));
    if (ends.length === 0) return;

    const delay = Math.max(Math.min(...ends) - Date.now() + NUDGE_RELOAD_MARGIN_MS, NUDGE_RELOAD_MIN_DELAY_MS);
    this.nudgeReloadTimer = setTimeout(() => {
      this.nudgeReloadTimer = null;
      this.load();
    }, delay);
  }

  private clearNudgeReload(): void {
    if (this.nudgeReloadTimer !== null) {
      clearTimeout(this.nudgeReloadTimer);
      this.nudgeReloadTimer = null;
    }
  }

  // ---- Display helpers ----------------------------------------------------------------------

  /**
   * The buttons shown on the card: the inline ones among its allowedActions, plus a disabled Nudge
   * while the server reports a cooldown for this viewer (nextNudgeAt is only sent to someone who
   * may nudge).
   */
  inlineButtonsFor(ask: BoardItemAsk): AskButton[] {
    return ACTION_BUTTONS
      .filter(b => b.placement === 'inline')
      .filter(b => ask.allowedActions.includes(b.action) || (b.action === AskAction.Nudge && this.isNudgeWaiting(ask)))
      .map(b => ({
        ...b,
        disabled: !ask.allowedActions.includes(b.action) || (b.action === AskAction.Complete && this.isAnswerMissing(ask))
      }));
  }

  /** The ask expects an answer and the recipient hasn't given it (since the last reopen). */
  isAnswerMissing(ask: BoardItemAsk): boolean {
    return ask.expectsAnswer && !ask.isAnswered;
  }

  /** The id of the hidden "reply with the answer first" text that describes the disabled Mark done. */
  answerFirstId(ask: BoardItemAsk): string {
    return `answer-first-${ask.id}`;
  }

  /** The recipient may send a reply and mark the ask done in one go (accepting it first if Pending). */
  canSendAndComplete(ask: BoardItemAsk): boolean {
    return ask.allowedActions.includes(AskAction.Complete) || ask.allowedActions.includes(AskAction.Accept);
  }

  /** Whom the viewer's reply goes to: the other side of the ask. */
  replyToName(ask: BoardItemAsk): string {
    return this.currentUserId === ask.recipientUserId ? ask.requestedByFullName : ask.recipientFullName;
  }

  /** The allowed actions in the card's "More actions" menu, with Withdraw last. */
  menuButtonsFor(ask: BoardItemAsk): ActionButton[] {
    return ACTION_BUTTONS.filter(b => b.placement === 'menu' && ask.allowedActions.includes(b.action));
  }

  /** True when the menu has items before the danger section, so a divider separates them. */
  hasMenuDivider(ask: BoardItemAsk, button: ActionButton): boolean {
    return !!button.danger && this.menuButtonsFor(ask).some(b => !b.danger);
  }

  /** Nudge is the viewer's to use, but not yet: the 24-hour cooldown is running. */
  isNudgeWaiting(ask: BoardItemAsk): boolean {
    return !!ask.nextNudgeAt && !ask.allowedActions.includes(AskAction.Nudge);
  }

  /** The id of the hidden "you can nudge again on …" text that describes the disabled button. */
  nudgeWaitId(ask: BoardItemAsk): string {
    return `nudge-wait-${ask.id}`;
  }

  stateLabel(ask: BoardItemAsk): string {
    return STATE_LABELS[ask.state];
  }

  timeAgo(iso: string | null | undefined): string | null {
    return timeAgo(iso);
  }

  /** At most a day old: shown as "2 hours ago", with the exact time on hover. */
  isRecent(iso: string | null | undefined): boolean {
    return isWithinDay(iso);
  }

  /** The DatePipe format for an older time shown as its day: "18 Oct" (with the year when it isn't this one). */
  dayFormat(iso: string): string {
    return askDayFormat(iso);
  }

  viewpoint(ask: BoardItemAsk): AskViewpoint {
    return askViewpoint(ask, this.currentUserId);
  }

  statusLine(ask: BoardItemAsk): AskStatusPart[] {
    return askStatusLine(ask);
  }

  keyDates(ask: BoardItemAsk): AskKeyDate[] {
    return askKeyDates(ask);
  }

  isDetailsOpen(ask: BoardItemAsk): boolean {
    return this.detailsOpen.has(ask.id);
  }

  toggleDetails(ask: BoardItemAsk): void {
    if (!this.detailsOpen.delete(ask.id)) this.detailsOpen.add(ask.id);
  }

  /** "Answer expected" matters only while it's still owed: an open ask without the answer yet. */
  showsAnswerExpected(ask: BoardItemAsk): boolean {
    return ask.expectsAnswer && ask.isOpen && !ask.isAnswered;
  }

  /** The recipient of an open ask always has the reply box: replying is their part. */
  replyBoxByDefault(ask: BoardItemAsk): boolean {
    return ask.isOpen && ask.canReply && this.viewpoint(ask) === 'recipient';
  }

  /** "Reply" is offered to the two participants when the box isn't already showing by default. */
  offersReply(ask: BoardItemAsk): boolean {
    return ask.canReply && !this.replyBoxByDefault(ask);
  }

  openReply(ask: BoardItemAsk): void {
    this.threads?.find(thread => thread.ask.id === ask.id)?.openReply();
  }

  /** Done by someone other than the recipient (while completing the item). */
  markedBy(ask: BoardItemAsk): string | null {
    return ask.state === AskState.Completed && ask.completedByUserId && ask.completedByUserId !== ask.recipientUserId
      ? ask.completedByFullName
      : null;
  }

  /** Why a required ask that isn't open still blocks completing the item. */
  unmetCause(ask: BoardItemAsk): string | null {
    if (!ask.isUnmetRequirement || ask.isOpen) return null;
    if (ask.state === AskState.Declined) return 'Required: declined';
    switch (ask.cancelReason) {
      case AskCancelReason.RecipientRemoved: return 'Required: the recipient left the board';
      case AskCancelReason.ItemCompleted: return 'Required: not done when the item was completed';
      default: return 'Required: withdrawn';
    }
  }

  /** True when the ask is due after the item itself (both dates set). */
  isDueAfterItem(dueDate: Date | string | null | undefined): boolean {
    const askDue = toDueDate(dueDate ?? undefined);
    const itemDue = toDueDate(this.itemDueDate ?? undefined);
    return !!askDue && !!itemDue && startOfDay(askDue) > startOfDay(itemDue);
  }

  get itemDueDateValue(): Date | undefined {
    return toDueDate(this.itemDueDate ?? undefined);
  }

  /** Members who can be asked: not the caller, not the item's assignee. */
  get recipientOptions(): Assignee[] {
    return this.members.filter(m =>
      m.id !== this.currentUserId
      && m.id !== this.assigneeId
      && !m.fullName.endsWith('(not a board member)'));
  }

  get formTitle(): string {
    switch (this.formMode?.kind) {
      case 'edit': return 'Edit the ask';
      case 'askAgain': return 'Ask again';
      case 'reassign': return 'Ask someone else instead';
      default: return 'Ask someone';
    }
  }

  get showsRecipient(): boolean {
    return this.formMode?.kind !== 'edit';
  }

  // ---- The form -----------------------------------------------------------------------------

  openCreate(): void {
    this.openForm({ kind: 'create' }, { recipientUserId: null, note: '', dueDate: null, isRequired: false, expectsAnswer: false });
  }

  cancelForm(): void {
    this.formMode = null;
  }

  submitForm(): void {
    const mode = this.formMode;
    if (!mode) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.value;
    const note: string = (value.note ?? '').trim();
    const dueDate = toIsoDate(value.dueDate);

    switch (mode.kind) {
      case 'create':
        this.run(this.askService.create(this.itemId, {
          recipientUserId: value.recipientUserId, note, dueDate, isRequired: !!value.isRequired, expectsAnswer: !!value.expectsAnswer
        }));
        break;
      case 'askAgain':
        this.run(this.askService.create(this.itemId, {
          recipientUserId: value.recipientUserId, note, dueDate, isRequired: !!value.isRequired,
          expectsAnswer: !!value.expectsAnswer, replacesAskId: mode.ask.id
        }));
        break;
      case 'reassign':
        this.run(this.askService.reassign(mode.ask.id, {
          expectedRevision: mode.ask.revision, newRecipientUserId: value.recipientUserId, note, dueDate
        }));
        break;
      case 'edit':
        this.run(this.askService.update(mode.ask.id, {
          expectedRevision: mode.ask.revision, note, dueDate, isRequired: mode.ask.isRequired
        }));
        break;
    }
  }

  /** Typing in the note: announces "20 characters left" and the limit once each as they're reached. */
  onNoteInput(event: Event): void {
    const length = (event.target as HTMLInputElement).value.length;
    const crossed = crossedThreshold(this.noteLengthSeen, length, ASK_NOTE_LIMIT_THRESHOLDS);
    this.noteLengthSeen = length;
    if (crossed) this.liveAnnouncer.announce(crossed.message, 'polite');
  }

  private openForm(mode: AskFormMode, value: AskFormValue): void {
    this.formMode = mode;
    this.errorMessage = null;
    this.form.reset(value);
    // Filling the form isn't typing: an edited 190-character note announces nothing on opening.
    this.noteLengthSeen = (this.form.value.note ?? '').length;

    // Reassigning moves the requirement and the expected answer as they are; editing changes
    // them through their own actions.
    for (const name of ['isRequired', 'expectsAnswer']) {
      const control = this.form.controls[name];
      if (mode.kind === 'reassign' || mode.kind === 'edit') {
        control.disable();
      } else {
        control.enable();
      }
    }
  }

  // ---- Actions ------------------------------------------------------------------------------

  act(ask: BoardItemAsk, action: AskAction): void {
    switch (action) {
      case AskAction.Accept:
        this.run(this.askService.changeState(ask.id, 'accept', ask.revision));
        break;
      case AskAction.Decline:
        // The reason shows on the ask's status line to everyone on the board.
        this.askForReason({
          title: 'Decline this ask?',
          message: `${ask.requestedByFullName} asked you:`,
          quote: quotedNote(ask.note),
          label: 'Why you\'re declining (optional)',
          hint: 'Everyone on this board will see this on the ask.',
          confirmLabel: 'Decline',
          maxLength: ASK_RESPONSE_NOTE_MAX_LENGTH
        }).subscribe(reason =>
          this.run(this.askService.changeState(ask.id, 'decline', ask.revision, reason || null)));
        break;
      case AskAction.Complete:
        // Nothing from the recipient yet: offer to send the result with it first.
        if (!ask.isAnswered) {
          this.errorMessage = null;
          this.completePromptAskId = ask.id;
          return;
        }
        this.complete(ask);
        break;
      case AskAction.Reopen:
        this.run(this.askService.changeState(ask.id, 'reopen', ask.revision));
        break;
      case AskAction.Cancel:
        this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: 'Withdraw this ask?',
            message: `${ask.recipientFullName} won't be asked to help with “${ask.note}” any more.`,
            confirmLabel: 'Withdraw',
            destructive: true
          },
          maxWidth: '95vw'
        }).afterClosed().subscribe(confirmed => {
          if (confirmed === true) {
            this.run(this.askService.changeState(ask.id, 'cancel', ask.revision));
          }
        });
        break;
      case AskAction.Nudge:
        this.run(this.askService.nudge(ask.id));
        break;
      case AskAction.SetRequired:
        this.run(this.askService.update(ask.id, {
          expectedRevision: ask.revision, note: ask.note, dueDate: ask.dueDate, isRequired: true
        }));
        break;
      case AskAction.SetExpectsAnswer:
      case AskAction.ClearExpectsAnswer:
        this.run(this.askService.setExpectsAnswer(ask.id, ask.revision, action === AskAction.SetExpectsAnswer));
        break;
      case AskAction.WaiveRequirement:
        // The reason is kept only in the item's history, which everyone on the board can read.
        this.askForReason({
          title: 'Waive the requirement?',
          message: `The item can then be completed without waiting for ${ask.recipientFullName}.`,
          quote: quotedNote(ask.note),
          label: 'Why it\'s no longer required (optional)',
          hint: 'Everyone on this board will see this in the item\'s history.',
          confirmLabel: 'Waive',
          maxLength: ASK_RESPONSE_NOTE_MAX_LENGTH
        }).subscribe(reason =>
          this.run(this.askService.update(ask.id, {
            expectedRevision: ask.revision, note: ask.note, dueDate: ask.dueDate, isRequired: false, waiveReason: reason || null
          })));
        break;
      case AskAction.Edit:
        this.openForm({ kind: 'edit', ask }, termsOf(ask, ask.recipientUserId));
        break;
      case AskAction.Reassign:
        this.openForm({ kind: 'reassign', ask }, termsOf(ask, null));
        break;
      case AskAction.AskAgain:
        this.openForm({ kind: 'askAgain', ask }, termsOf(ask, null));
        break;
    }
  }

  /**
   * Asks for an optional reason in an in-app dialog; emits it ('' when none) once confirmed, and
   * nothing when cancelled. Opened with disableClose: the dialog itself lets a backdrop click
   * cancel only while nothing is typed.
   */
  private askForReason(data: ReasonDialogData): Observable<string> {
    return this.dialog.open<ReasonDialogComponent, ReasonDialogData, string>(ReasonDialogComponent, {
      data,
      disableClose: true,
      ariaDescribedBy: REASON_DIALOG_MESSAGE_ID,
      maxWidth: '95vw'
    }).afterClosed().pipe(filter((reason): reason is string => typeof reason === 'string'));
  }

  // ---- Replies ------------------------------------------------------------------------------

  sendReply(ask: BoardItemAsk, body: string, thread: AskThreadComponent): void {
    this.run(this.askService.addReply(ask.id, body), { onSaved: () => thread.clearDraft() });
  }

  /** "Send & mark done": one request that posts the reply and completes the ask. */
  sendAndComplete(ask: BoardItemAsk, body: string, thread: AskThreadComponent): void {
    this.run(this.askService.changeState(ask.id, 'complete', ask.revision, null, body), {
      onSaved: () => thread.clearDraft(),
      completing: ask
    });
  }

  completeWithoutReply(ask: BoardItemAsk): void {
    this.complete(ask);
  }

  editReply(edit: ReplyEdit, thread: AskThreadComponent): void {
    this.run(this.askService.editReply(edit.reply.id, edit.body), { onSaved: () => thread.finishEdit() });
  }

  private complete(ask: BoardItemAsk): void {
    this.run(this.askService.changeState(ask.id, 'complete', ask.revision), { completing: ask });
  }

  /**
   * Sends a change, then reloads the list; on an error shows why and reloads, so a stale view
   * refreshes. When marking done is refused for want of an answer, the reply box opens for it.
   */
  private run(request: Observable<BoardItemAsk>, options: { onSaved?: () => void; completing?: BoardItemAsk } = {}): void {
    this.isBusy = true;
    this.errorMessage = null;

    request.subscribe({
      next: () => {
        this.isBusy = false;
        this.formMode = null;
        this.completePromptAskId = null;
        options.onSaved?.();
        this.load();
      },
      error: error => {
        this.isBusy = false;
        this.errorMessage = isNudgeTooSoonError(error) ? NUDGE_TOO_SOON_TEXT : askErrorMessage(error);
        if (options.completing && isAnswerRequiredError(error)) {
          this.completePromptAskId = options.completing.id;
        }
        this.load();
      }
    });
  }
}

interface AskFormValue {
  recipientUserId: string | null;
  note: string;
  dueDate: Date | null;
  isRequired: boolean;
  expectsAnswer: boolean;
}

/** An existing ask's terms, to start the edit, reassign or ask-again form from. */
function termsOf(ask: BoardItemAsk, recipientUserId: string | null): AskFormValue {
  return {
    recipientUserId,
    note: ask.note,
    dueDate: toDueDate(ask.dueDate ?? undefined) ?? null,
    isRequired: ask.isRequired,
    expectsAnswer: ask.expectsAnswer
  };
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** A picked date as the API expects it: ISO in UTC (with "Z"), or null. */
function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}
