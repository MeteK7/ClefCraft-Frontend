import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable } from 'rxjs';

import { BoardItemAskService } from '../../_services/board-item-ask.service';
import { AuthService } from '../../_services/auth.service';
import { Assignee } from '../../models/assignee.model';
import {
  AskAction,
  AskCancelReason,
  AskState,
  AskSummary,
  BoardItemAsk,
  askErrorMessage,
  daysAgo,
  toAskSummary
} from '../../models/board-item-ask.model';
import { toDueDate } from '../../relationship-engine/analytics/finish-before';

/** The note's limit, as the API enforces it (BoardItemAskLimits.NoteMaxLength). */
export const ASK_NOTE_MAX_LENGTH = 200;

type AskFormMode =
  | { kind: 'create' }
  | { kind: 'edit'; ask: BoardItemAsk }
  | { kind: 'askAgain'; ask: BoardItemAsk }
  | { kind: 'reassign'; ask: BoardItemAsk };

interface ActionButton {
  action: AskAction;
  label: string;
}

// The buttons each allowed action gets, in display order. CompleteOnBehalf isn't a button: it is
// offered by the completion prompt only.
const ACTION_BUTTONS: ActionButton[] = [
  { action: AskAction.Accept, label: 'Accept' },
  { action: AskAction.Decline, label: 'Decline' },
  { action: AskAction.Complete, label: 'Mark done' },
  { action: AskAction.Reopen, label: 'Reopen' },
  { action: AskAction.Nudge, label: 'Nudge' },
  { action: AskAction.Edit, label: 'Edit' },
  { action: AskAction.SetRequired, label: 'Make required' },
  { action: AskAction.WaiveRequirement, label: 'Waive requirement' },
  { action: AskAction.Reassign, label: 'Ask someone else' },
  { action: AskAction.AskAgain, label: 'Ask again' },
  { action: AskAction.Cancel, label: 'Withdraw' }
];

const STATE_LABELS: Record<AskState, string> = {
  [AskState.Pending]: 'Waiting for an answer',
  [AskState.Accepted]: 'Accepted',
  [AskState.Declined]: 'Declined',
  [AskState.Completed]: 'Done',
  [AskState.Cancelled]: 'Cancelled'
};

/**
 * "Asked to help": the item's asks, the actions the current user may take on each (exactly the
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
    MatInputModule,
    MatNativeDateModule,
    MatSelectModule,
    MatTooltipModule
  ],
  templateUrl: './board-item-asks.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './board-item-asks.component.css'
})
export class BoardItemAsksComponent implements OnInit, OnChanges {
  @Input() itemId!: number;
  /** The item's saved assignee: already responsible, so not someone to ask. */
  @Input() assigneeId: string | null | undefined;
  /** The item's due date, for the "due after the item" warning. */
  @Input() itemDueDate: Date | string | null | undefined;
  /** The board's members, as the dialog already loaded them for the assignee picker. */
  @Input() members: Assignee[] = [];

  /**
   * Emits after every load. Asynchronous, because the parent dialog shows state derived from it:
   * a load that completes during the parent's change detection mustn't change what it just checked.
   */
  @Output() summaryChange = new EventEmitter<AskSummary>(true);

  readonly AskState = AskState;
  readonly noteMaxLength = ASK_NOTE_MAX_LENGTH;

  asks: BoardItemAsk[] = [];
  isLoading = false;
  isBusy = false;
  errorMessage: string | null = null;

  formMode: AskFormMode | null = null;
  form: FormGroup;

  private readonly currentUserId: string | null;

  constructor(
    private askService: BoardItemAskService,
    authService: AuthService,
    fb: FormBuilder
  ) {
    this.currentUserId = authService.getUserId();
    this.form = fb.group({
      recipientUserId: [null as string | null, Validators.required],
      note: ['', [Validators.required, Validators.maxLength(ASK_NOTE_MAX_LENGTH)]],
      dueDate: [null as Date | null],
      isRequired: [false]
    });
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['itemId'] && !changes['itemId'].firstChange) {
      this.load();
    }
  }

  // ---- Loading ----------------------------------------------------------------------------

  load(): void {
    if (!this.itemId) return;

    this.isLoading = true;
    this.askService.getForItem(this.itemId).subscribe({
      next: asks => {
        this.asks = asks;
        this.isLoading = false;
        this.summaryChange.emit(toAskSummary(asks));
      },
      error: error => {
        this.isLoading = false;
        this.errorMessage = askErrorMessage(error, 'The asks could not be loaded.');
      }
    });
  }

  // ---- Display helpers ----------------------------------------------------------------------

  actionsFor(ask: BoardItemAsk): ActionButton[] {
    return ACTION_BUTTONS.filter(b => ask.allowedActions.includes(b.action));
  }

  stateLabel(ask: BoardItemAsk): string {
    return STATE_LABELS[ask.state];
  }

  askedAgo(ask: BoardItemAsk): string | null {
    return daysAgo(ask.dateCreated);
  }

  nudgedAgo(ask: BoardItemAsk): string | null {
    return daysAgo(ask.lastNudgedAt);
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
    this.openForm({ kind: 'create' }, { recipientUserId: null, note: '', dueDate: null, isRequired: false });
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
          recipientUserId: value.recipientUserId, note, dueDate, isRequired: !!value.isRequired
        }));
        break;
      case 'askAgain':
        this.run(this.askService.create(this.itemId, {
          recipientUserId: value.recipientUserId, note, dueDate, isRequired: !!value.isRequired, replacesAskId: mode.ask.id
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

  private openForm(mode: AskFormMode, value: { recipientUserId: string | null; note: string; dueDate: Date | null; isRequired: boolean }): void {
    this.formMode = mode;
    this.errorMessage = null;
    this.form.reset(value);

    const isRequired = this.form.controls['isRequired'];
    // Reassigning moves the requirement as it is; editing changes it through its own actions.
    if (mode.kind === 'reassign' || mode.kind === 'edit') {
      isRequired.disable();
    } else {
      isRequired.enable();
    }
  }

  // ---- Actions ------------------------------------------------------------------------------

  act(ask: BoardItemAsk, action: AskAction): void {
    switch (action) {
      case AskAction.Accept:
        this.run(this.askService.changeState(ask.id, 'accept', ask.revision));
        break;
      case AskAction.Decline: {
        const reason = window.prompt('Why are you declining? (optional)', '');
        if (reason === null) return;
        this.run(this.askService.changeState(ask.id, 'decline', ask.revision, reason.trim() || null));
        break;
      }
      case AskAction.Complete:
        this.run(this.askService.changeState(ask.id, 'complete', ask.revision));
        break;
      case AskAction.Reopen:
        this.run(this.askService.changeState(ask.id, 'reopen', ask.revision));
        break;
      case AskAction.Cancel:
        if (!window.confirm(`Withdraw the ask to ${ask.recipientFullName}?`)) return;
        this.run(this.askService.changeState(ask.id, 'cancel', ask.revision));
        break;
      case AskAction.Nudge:
        this.run(this.askService.nudge(ask.id));
        break;
      case AskAction.SetRequired:
        this.run(this.askService.update(ask.id, {
          expectedRevision: ask.revision, note: ask.note, dueDate: ask.dueDate, isRequired: true
        }));
        break;
      case AskAction.WaiveRequirement: {
        const reason = window.prompt('Why is this ask no longer required? (optional)', '');
        if (reason === null) return;
        this.run(this.askService.update(ask.id, {
          expectedRevision: ask.revision, note: ask.note, dueDate: ask.dueDate, isRequired: false, waiveReason: reason.trim() || null
        }));
        break;
      }
      case AskAction.Edit:
        this.openForm({ kind: 'edit', ask }, { recipientUserId: ask.recipientUserId, note: ask.note, dueDate: toDueDate(ask.dueDate ?? undefined) ?? null, isRequired: ask.isRequired });
        break;
      case AskAction.Reassign:
        this.openForm({ kind: 'reassign', ask }, { recipientUserId: null, note: ask.note, dueDate: toDueDate(ask.dueDate ?? undefined) ?? null, isRequired: ask.isRequired });
        break;
      case AskAction.AskAgain:
        this.openForm({ kind: 'askAgain', ask }, { recipientUserId: null, note: ask.note, dueDate: toDueDate(ask.dueDate ?? undefined) ?? null, isRequired: ask.isRequired });
        break;
    }
  }

  /** Sends a change, then reloads the list; on an error shows why and reloads, so a stale view refreshes. */
  private run(request: Observable<BoardItemAsk>): void {
    this.isBusy = true;
    this.errorMessage = null;

    request.subscribe({
      next: () => {
        this.isBusy = false;
        this.formMode = null;
        this.load();
      },
      error: error => {
        this.isBusy = false;
        this.errorMessage = askErrorMessage(error);
        this.load();
      }
    });
  }
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
