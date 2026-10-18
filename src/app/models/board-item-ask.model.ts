// Asks on board items, as the API returns and accepts them. Enums arrive as numbers and must
// match the backend's (ClefCraft.Domain.Enums and BoardItemAskAction).

export enum AskState {
  Pending = 0,
  Accepted = 1,
  Declined = 2,
  Completed = 3,
  Cancelled = 4
}

export enum AskCancelReason {
  Withdrawn = 0,
  ItemCompleted = 1,
  RecipientRemoved = 2
}

/** What the current user may do with an ask (BoardItemAskDto.allowedActions). */
export enum AskAction {
  Accept = 0,
  Decline = 1,
  Complete = 2,
  Reopen = 3,
  Cancel = 4,
  Edit = 5,
  SetRequired = 6,
  WaiveRequirement = 7,
  Nudge = 8,
  Reassign = 9,
  AskAgain = 10,
  CompleteOnBehalf = 11
}

export interface BoardItemAsk {
  id: number;
  boardItemId: number;
  boardItemTitle: string;
  boardId: number;
  requestedByUserId: string;
  requestedByFullName: string;
  recipientUserId: string;
  recipientFullName: string;
  recipientIsBoardMember: boolean;
  note: string;
  dueDate: string | null;
  isRequired: boolean;
  state: AskState;
  responseNote: string | null;
  respondedAt: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  completedByFullName: string | null;
  cancelReason: AskCancelReason | null;
  /** When the ask was made: its age. Never reset by edits or nudges. */
  dateCreated: string;
  lastNudgedAt: string | null;
  /**
   * Set only when the current user could nudge this ask but the 24-hour cooldown isn't over:
   * when it is. Null when they can nudge now (Nudge is in allowedActions) or not at all.
   */
  nextNudgeAt: string | null;
  /** Sent back as expectedRevision with every change, and in the completion snapshot. */
  revision: number;
  isOpen: boolean;
  /** Required and not Completed: blocks completing the item until it's resolved. */
  isUnmetRequirement: boolean;
  allowedActions: AskAction[];
}

export interface AskSummaryItem {
  askId: number;
  recipientUserId: string;
  recipientFullName: string;
  state: AskState;
  isRequired: boolean;
  dueDate: string | null;
  dateCreated: string;
}

/** What a board card shows (BoardItemDto.askSummary). */
export interface AskSummary {
  openCount: number;
  unmetRequiredCount: number;
  completedCount: number;
  openAsks: AskSummaryItem[];
}

export interface AcknowledgedAsk {
  askId: number;
  revision: number;
}

/** UpdateBoardItemCommand.askClosure: what the user decided about the item's asks when completing it. */
export interface AskClosure {
  acknowledgedAsks: AcknowledgedAsk[];
  completeAskIds: number[];
  overrideAskIds: number[];
}

export interface CreateAskRequest {
  recipientUserId: string;
  note: string;
  dueDate?: string | null;
  isRequired: boolean;
  /** "Ask again": the Declined or Cancelled ask this follows up. */
  replacesAskId?: number | null;
}

export interface UpdateAskRequest {
  expectedRevision: number;
  note: string;
  dueDate: string | null;
  isRequired: boolean;
  waiveReason?: string | null;
}

export interface ReassignAskRequest {
  expectedRevision: number;
  newRecipientUserId: string;
  note?: string | null;
  dueDate?: string | null;
}

export type AskStateChange = 'accept' | 'decline' | 'complete' | 'reopen' | 'cancel';

export type AskDirection = 'received' | 'sent';

/** The backend's 400 title when the completion snapshot doesn't match the item's asks any more. */
export const ASKS_CHANGED_MESSAGE = "The item's asks changed; review them again.";

/** The backend's 400 title when an item with asks to review is completed without a closure. */
export const ASK_CLOSURE_MISSING_MESSAGE = 'This item has open or required asks; review them before completing it.';

export const EMPTY_ASK_SUMMARY: AskSummary = { openCount: 0, unmetRequiredCount: 0, completedCount: 0, openAsks: [] };

/** The asks to review before completing an item: the open ones and the unmet requirements. */
export function asksToReview(asks: BoardItemAsk[]): BoardItemAsk[] {
  return asks.filter(a => a.isOpen || a.isUnmetRequirement);
}

/** The card summary for an item's asks, computed the way the API computes it for the board. */
export function toAskSummary(asks: BoardItemAsk[]): AskSummary {
  const open = asks.filter(a => a.isOpen);

  return {
    openCount: open.length,
    unmetRequiredCount: asks.filter(a => a.isUnmetRequirement).length,
    completedCount: asks.filter(a => a.state === AskState.Completed).length,
    openAsks: open.map(a => ({
      askId: a.id,
      recipientUserId: a.recipientUserId,
      recipientFullName: a.recipientFullName,
      state: a.state,
      isRequired: a.isRequired,
      dueDate: a.dueDate,
      dateCreated: a.dateCreated
    }))
  };
}

/**
 * The completion snapshot for the reviewed asks, given which Accepted asks the user chose to mark
 * done. The override list is derived from those choices: every required ask that isn't being
 * marked done is completed past, so it must be named.
 */
export function buildAskClosure(reviewed: BoardItemAsk[], markDoneIds: ReadonlySet<number>): AskClosure {
  const completeAskIds = reviewed
    .filter(a => markDoneIds.has(a.id) && a.state === AskState.Accepted)
    .map(a => a.id);
  const completing = new Set(completeAskIds);

  return {
    acknowledgedAsks: reviewed.map(a => ({ askId: a.id, revision: a.revision })),
    completeAskIds,
    overrideAskIds: reviewed.filter(a => a.isRequired && !completing.has(a.id)).map(a => a.id)
  };
}

/** True for the 400s that mean "the asks changed: review them again", whatever the shape. */
export function isStaleAskClosureError(error: unknown): boolean {
  const title = (error as { status?: number; error?: { title?: unknown } } | null)?.error?.title;
  return (error as { status?: number })?.status === 400
    && (title === ASKS_CHANGED_MESSAGE || title === ASK_CLOSURE_MISSING_MESSAGE);
}

/**
 * A readable reason from an API error: the first field error (a validation problem), then the
 * problem's title, as the registration form reads them.
 */
export function askErrorMessage(error: unknown, fallback = 'Something went wrong; please try again.'): string {
  const body = (error as { error?: { errors?: Record<string, string[]> | null; title?: unknown } } | null)?.error;
  const firstFieldError = body?.errors ? Object.values(body.errors).flat()[0] : undefined;

  if (firstFieldError) return firstFieldError;
  if (typeof body?.title === 'string' && body.title.trim()) return body.title;
  return fallback;
}

/** How often an ask can be nudged, as the server enforces it (BoardItemAskLimits.NudgeInterval). */
export const NUDGE_RULE_TEXT = 'You can nudge once every 24 hours.';

/** The server's 400 title for a nudge inside the cooldown (NudgeAskCommandHandler.AlreadyNudgedMessage). */
export const NUDGE_TOO_SOON_MESSAGE = 'This ask was already nudged in the last 24 hours.';

/** True for the 400 the server returns when an ask is nudged again within 24 hours. */
export function isNudgeTooSoonError(error: unknown): boolean {
  const title = (error as { status?: number; error?: { title?: unknown } } | null)?.error?.title;
  return (error as { status?: number })?.status === 400 && title === NUDGE_TOO_SOON_MESSAGE;
}

/**
 * How long ago an API timestamp was: "just now", "5 minutes ago", "3 hours ago", "6 days ago".
 * Null when there's no timestamp.
 */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return null;

  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * The DatePipe format for an exact ask time: the year is left out for times in the current
 * (local) year. Both are compared in the viewer's own timezone, as the time is shown.
 */
export function askDateFormat(iso: string, now: Date = new Date()): string {
  return new Date(iso).getFullYear() === now.getFullYear() ? 'd MMM, HH:mm' : 'd MMM y, HH:mm';
}
