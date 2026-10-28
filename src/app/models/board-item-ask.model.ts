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
  CompleteOnBehalf = 11,
  SetExpectsAnswer = 12,
  ClearExpectsAnswer = 13
}

/**
 * Why an ask is the current user's move (AskTurn on the server, the one place this is decided).
 * Respond: accept or decline. Deliver: mark done what you accepted. ResolveRequirement: a required
 * ask was declined or cancelled; ask someone else or waive it.
 */
export enum AskTurnReason {
  Respond = 0,
  Deliver = 1,
  ResolveRequirement = 2
}

/** What an item's asks need from the current user (BoardItemDto.askAttention). */
export interface AskAttention {
  /** How many of the item's asks are the current user's move. */
  yourMove: number;
}

/** A plain-text message on an ask from its requester or recipient (AskReplyDto). */
export interface AskReply {
  id: number;
  authorUserId: string;
  authorFullName: string;
  body: string;
  dateCreated: string;
  /** When the author last edited it; null when never edited. */
  dateEdited: string | null;
  /** Written by the current user, who may edit it. */
  isMine: boolean;
}

export interface BoardItemAsk {
  id: number;
  boardItemId: number;
  boardItemTitle: string;
  boardId: number;
  /** Filled for the caller's own lists ("Waiting for you"); null elsewhere. */
  boardTitle?: string | null;
  requestedByUserId: string;
  requestedByFullName: string;
  recipientUserId: string;
  recipientFullName: string;
  recipientIsBoardMember: boolean;
  note: string;
  dueDate: string | null;
  isRequired: boolean;
  /** The ask can't be marked done until the recipient replies (see isAnswered). */
  expectsAnswer: boolean;
  /** The recipient has replied since the ask was last reopened. */
  isAnswered: boolean;
  state: AskState;
  responseNote: string | null;
  respondedAt: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  completedByFullName: string | null;
  cancelReason: AskCancelReason | null;
  /** When it was cancelled, and by whom; null while it isn't, or for a cancel with no record of it. */
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelledByFullName: string | null;
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
  /** Why the ask is the current user's move; null when it isn't theirs. Optional actions never make it so. */
  yourMove: AskTurnReason | null;
  /** The current user may post a reply: they are the requester or recipient, and it isn't cancelled. */
  canReply: boolean;
  /** Oldest first. */
  replies: AskReply[];
  /**
   * The reply that answered the ask, fixed when it was marked done (one of replies). Null while
   * it isn't done, or when it was done without a reply.
   */
  answerReplyId: number | null;
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
  expectsAnswer?: boolean;
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

/** received: asked of you; sent: asks you made; waiting: your move, as recipient or requester (AskTurn). */
export type AskDirection = 'received' | 'sent' | 'waiting';

/** The backend's 400 title when the completion snapshot doesn't match the item's asks any more. */
export const ASKS_CHANGED_MESSAGE = "The item's asks changed; review them again.";

/**
 * The board link to an item, opening it with the ask in view (null: just the item). The board
 * page switches to boardId first when another board is showing.
 */
export function askLink(boardId: number, boardItemId: number, askId: number | null): { openItemId: number; boardId: number; askId?: number } {
  return askId === null ? { openItemId: boardItemId, boardId } : { openItemId: boardItemId, boardId, askId };
}

/** What an item's asks need from the current user: how many the server says are their move. */
export function toAskAttention(asks: BoardItemAsk[]): AskAttention {
  return { yourMove: asks.filter(a => a.yourMove !== null).length };
}

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

/** Someone who helped with an item: the recipient of asks that are done, newest first. */
export interface AskContributor {
  userId: string;
  fullName: string;
  asks: { askId: number; note: string; completedAt: string }[];
}

/**
 * The rail's order: the newest ask first, by when it was asked; the higher id first on a tie.
 * Not by latest activity, so a card never moves while it's being read or replied to.
 */
export function newestFirst(asks: readonly BoardItemAsk[]): BoardItemAsk[] {
  return [...asks].sort((a, b) => Date.parse(b.dateCreated) - Date.parse(a.dateCreated) || b.id - a.id);
}

/**
 * Whether the rail lists an ask with the active ones: it's open (pending or accepted), or it's an
 * unmet requirement, as the server says (required and not done, whatever its state: a declined
 * or withdrawn one still needs asking again or waiving). Everything else is closed.
 */
export function isActiveAsk(ask: BoardItemAsk): boolean {
  return ask.isOpen || ask.isUnmetRequirement;
}

/**
 * Who helped with an item: the recipients of its done asks, whoever marked them done. Declined,
 * withdrawn and waived asks don't count, nor do replies alone. People come in order of their
 * latest contribution.
 */
export function toContributors(asks: BoardItemAsk[]): AskContributor[] {
  const byUser = new Map<string, AskContributor>();
  const done = asks
    .filter(a => a.state === AskState.Completed)
    .map(a => ({ ask: a, completedAt: a.completedAt ?? a.dateCreated }))
    .sort((x, y) => Date.parse(y.completedAt) - Date.parse(x.completedAt));

  for (const { ask, completedAt } of done) {
    let contributor = byUser.get(ask.recipientUserId);
    if (!contributor) {
      contributor = { userId: ask.recipientUserId, fullName: ask.recipientFullName, asks: [] };
      byUser.set(ask.recipientUserId, contributor);
    }
    contributor.asks.push({ askId: ask.id, note: ask.note, completedAt });
  }
  return [...byUser.values()];
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

/** The DatePipe format for an exact ask time, shown in the viewer's own timezone: "18 Oct 2026, 16:48". */
export const ASK_EXACT_TIME_FORMAT = 'd MMM y, HH:mm';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True for a timestamp at most 24 hours old, which the panel shows as relative time ("2 hours
 * ago") with the exact time on hover. A time slightly in the future (clock skew) counts as recent.
 */
export function isWithinDay(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  return !isNaN(then) && now.getTime() - then <= DAY_MS;
}

/** The DatePipe format for an older ask time shown as a day: "18 Oct", with the year when it isn't this one. */
export function askDayFormat(iso: string, now: Date = new Date()): string {
  return new Date(iso).getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM y';
}

/** One fact on an ask's status line, such as "Asked" + when. */
export interface AskStatusPart {
  label: string;
  /** When it happened; null when the ask doesn't record it (a withdrawal). */
  iso: string | null;
}

/**
 * The one line that says where an ask stands: its current state and when it got there, plus the
 * latest nudge while it waits for an answer. History beyond that is in keyDates.
 */
export function askStatusLine(ask: BoardItemAsk): AskStatusPart[] {
  switch (ask.state) {
    case AskState.Pending:
      return ask.lastNudgedAt
        ? [{ label: 'Asked', iso: ask.dateCreated }, { label: 'nudged', iso: ask.lastNudgedAt }]
        : [{ label: 'Asked', iso: ask.dateCreated }];
    case AskState.Accepted:
      return [{ label: 'Accepted', iso: ask.respondedAt ?? ask.dateCreated }];
    case AskState.Declined:
      return [{ label: 'Declined', iso: ask.respondedAt }];
    case AskState.Completed:
      return [{ label: 'Done', iso: ask.completedAt }];
    case AskState.Cancelled:
      return [{ label: cancelLabel(ask), iso: ask.cancelledAt }];
  }
}

/** How a cancelled ask ended, by its cancel reason. */
export function cancelLabel(ask: BoardItemAsk): string {
  switch (ask.cancelReason) {
    case AskCancelReason.ItemCompleted: return 'Closed when the item was completed';
    case AskCancelReason.RecipientRemoved: return 'Closed: the recipient left the board';
    default: return 'Withdrawn';
  }
}

export interface AskKeyDate {
  label: string;
  iso: string;
  /** Who did it, where the ask records it. */
  by: string | null;
  /** The decline reason, shown with the decline. */
  note: string | null;
}

/**
 * The dates the ask records, oldest first: asked, the latest nudge, the latest accept or decline,
 * and done or cancelled. Earlier nudges and reopen cycles aren't kept on the ask; the item's
 * History has them.
 */
export function askKeyDates(ask: BoardItemAsk): AskKeyDate[] {
  const dates: AskKeyDate[] = [{ label: 'Asked', iso: ask.dateCreated, by: ask.requestedByFullName, note: null }];

  if (ask.lastNudgedAt) {
    dates.push({ label: 'Last nudged', iso: ask.lastNudgedAt, by: null, note: null });
  }
  if (ask.respondedAt) {
    const declined = ask.state === AskState.Declined;
    dates.push({
      label: declined ? 'Declined' : 'Accepted',
      iso: ask.respondedAt,
      by: ask.recipientFullName,
      note: declined ? ask.responseNote : null
    });
  }
  if (ask.completedAt && ask.state === AskState.Completed) {
    dates.push({ label: 'Done', iso: ask.completedAt, by: ask.completedByFullName, note: null });
  }
  if (ask.cancelledAt && ask.state === AskState.Cancelled) {
    dates.push({ label: cancelLabel(ask), iso: ask.cancelledAt, by: ask.cancelledByFullName, note: null });
  }

  return dates.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
}

/** How the viewer relates to an ask, for its header: "Asked Ayse", "From Rae" or "Rae → Ayse". */
export type AskViewpoint = 'requester' | 'recipient' | 'other';

export function askViewpoint(ask: BoardItemAsk, viewerId: string | null): AskViewpoint {
  if (viewerId === ask.requestedByUserId) return 'requester';
  if (viewerId === ask.recipientUserId) return 'recipient';
  return 'other';
}

/** A reply's limit, as the API enforces it (BoardItemAskLimits.ReplyMaxLength). */
export const ASK_REPLY_MAX_LENGTH = 2000;

/** The reply box shows its character count from this length on. */
export const ASK_REPLY_COUNTER_FROM = 1800;

/** A length worth announcing once, as typing reaches it. */
export interface LengthThreshold {
  at: number;
  message: string;
}

/** "N characters left" at `warnAt`, then "Character limit reached" at `max`. */
export function limitThresholds(max: number, warnAt: number): LengthThreshold[] {
  return [
    { at: warnAt, message: `${max - warnAt} characters left` },
    { at: max, message: 'Character limit reached' }
  ];
}

export const ASK_REPLY_LIMIT_THRESHOLDS = limitThresholds(ASK_REPLY_MAX_LENGTH, ASK_REPLY_COUNTER_FROM);

/**
 * The highest threshold that typing from `previous` to `current` characters reached, or null.
 * A threshold is reached when previous < at <= current, so deleting never announces, and
 * dropping below one lets it be reached, and announced, again.
 */
export function crossedThreshold(
  previous: number, current: number, thresholds: readonly LengthThreshold[]
): LengthThreshold | null {
  let crossed: LengthThreshold | null = null;
  for (const threshold of thresholds) {
    if (previous < threshold.at && threshold.at <= current && (!crossed || threshold.at > crossed.at)) {
      crossed = threshold;
    }
  }
  return crossed;
}

/** The code of the 400 that refuses to mark an ask done before the recipient has answered. */
export const ASK_ANSWER_REQUIRED_CODE = 'ASK_ANSWER_REQUIRED';

/** True for the 400 the server returns when an ask that expects an answer is marked done without one. */
export function isAnswerRequiredError(error: unknown): boolean {
  const code = (error as { status?: number; error?: { code?: unknown } } | null)?.error?.code;
  return (error as { status?: number })?.status === 400 && code === ASK_ANSWER_REQUIRED_CODE;
}

export interface ReplySegment {
  kind: 'text' | 'code';
  text: string;
}

const FENCE = '```';

/**
 * A reply body split into plain text and the code between triple-backtick fences, for rendering
 * code as a block. An optional language word on the opening fence's line ("```sql") is dropped,
 * as is one line break on each side of a fence. An unclosed fence is left as text.
 */
export function parseReplyBody(body: string): ReplySegment[] {
  const segments: ReplySegment[] = [];
  let rest = body;

  for (;;) {
    const open = rest.indexOf(FENCE);
    const close = open < 0 ? -1 : rest.indexOf(FENCE, open + FENCE.length);
    if (open < 0 || close < 0) break;

    pushText(segments, rest.slice(0, open));

    let code = rest.slice(open + FENCE.length, close);
    const firstLineEnd = code.indexOf('\n');
    // Only an empty line or a lowercase word ("sql", "ts") counts as the language, so a first line
    // of code on the fence's line ("```BEGIN") isn't taken for one.
    if (firstLineEnd >= 0 && /^([a-z][\w+#.-]{0,19})?$/.test(code.slice(0, firstLineEnd).trim())) {
      code = code.slice(firstLineEnd + 1);
    }
    code = code.replace(/\r?\n$/, '');
    if (code.trim()) segments.push({ kind: 'code', text: code });

    rest = rest.slice(close + FENCE.length).replace(/^\r?\n/, '');
  }

  pushText(segments, rest);
  return segments;
}

function pushText(segments: ReplySegment[], text: string): void {
  const trimmed = text.replace(/\r?\n$/, '');
  if (trimmed.trim()) segments.push({ kind: 'text', text: trimmed });
}

/** A reply on one line, for a folded list: whitespace collapsed, fences dropped, cut at the length. */
/** A decline reason or a waive reason, as the API enforces it (BoardItemAskLimits.ResponseNoteMaxLength). */
export const ASK_RESPONSE_NOTE_MAX_LENGTH = 500;

/** An ask's note quoted in a message: one line, cut at 80 characters with "…"; null when empty. */
export function quotedNote(note: string | null | undefined): string | null {
  const excerpt = replyExcerpt(note ?? '', 80);
  return excerpt === '' ? null : excerpt;
}

export function replyExcerpt(body: string, max = 120): string {
  const text = body.replace(/```[\w+#.-]*/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}
