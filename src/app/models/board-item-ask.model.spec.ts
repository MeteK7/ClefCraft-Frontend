import {
  ASKS_CHANGED_MESSAGE,
  ASK_CLOSURE_MISSING_MESSAGE,
  AskAction,
  AskCancelReason,
  AskState,
  NUDGE_TOO_SOON_MESSAGE,
  askDateFormat,
  askErrorMessage,
  asksToReview,
  buildAskClosure,
  isNudgeTooSoonError,
  isStaleAskClosureError,
  timeAgo,
  toAskSummary
} from './board-item-ask.model';
import { makeAsk } from './board-item-ask.testing';

describe('board-item-ask model', () => {
  describe('buildAskClosure', () => {
    const pending = makeAsk({ id: 1, state: AskState.Pending, revision: 4 });
    const acceptedRequired = makeAsk({ id: 2, state: AskState.Accepted, isRequired: true, revision: 7 });
    const declinedRequired = makeAsk({ id: 3, state: AskState.Declined, isRequired: true, revision: 2 });
    const reviewed = [pending, acceptedRequired, declinedRequired];

    it('acknowledges every reviewed ask at the revision it was loaded with', () => {
      expect(buildAskClosure(reviewed, new Set()).acknowledgedAsks).toEqual([
        { askId: 1, revision: 4 },
        { askId: 2, revision: 7 },
        { askId: 3, revision: 2 }
      ]);
    });

    it('overrides every required ask that is not being marked done', () => {
      const closure = buildAskClosure(reviewed, new Set());

      expect(closure.completeAskIds).toEqual([]);
      expect(closure.overrideAskIds).toEqual([2, 3]);
    });

    it('marking a required Accepted ask done removes it from the override list', () => {
      const closure = buildAskClosure(reviewed, new Set([2]));

      expect(closure.completeAskIds).toEqual([2]);
      expect(closure.overrideAskIds).toEqual([3]);
    });

    it('never marks an ask done that is not Accepted', () => {
      const closure = buildAskClosure(reviewed, new Set([1, 3]));

      expect(closure.completeAskIds).toEqual([]);
      expect(closure.overrideAskIds).toEqual([2, 3]);
    });

    it('has nothing to override when no reviewed ask is required', () => {
      expect(buildAskClosure([pending], new Set()).overrideAskIds).toEqual([]);
    });
  });

  it('asksToReview keeps the open asks and the unmet requirements', () => {
    const asks = [
      makeAsk({ id: 1, state: AskState.Pending }),
      makeAsk({ id: 2, state: AskState.Declined }),
      makeAsk({ id: 3, state: AskState.Cancelled, isRequired: true, cancelReason: AskCancelReason.RecipientRemoved }),
      makeAsk({ id: 4, state: AskState.Completed, isRequired: true })
    ];

    expect(asksToReview(asks).map(a => a.id)).toEqual([1, 3]);
  });

  it('toAskSummary counts like the board does', () => {
    const summary = toAskSummary([
      makeAsk({ id: 1, state: AskState.Pending }),
      makeAsk({ id: 2, state: AskState.Accepted, isRequired: true }),
      makeAsk({ id: 3, state: AskState.Declined, isRequired: true }),
      makeAsk({ id: 4, state: AskState.Completed })
    ]);

    expect(summary.openCount).toBe(2);
    expect(summary.unmetRequiredCount).toBe(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.openAsks.map(a => a.askId)).toEqual([1, 2]);
  });

  describe('isStaleAskClosureError', () => {
    it('is true for the 400 whose title is the shared "asks changed" message', () => {
      expect(isStaleAskClosureError({ status: 400, error: { title: ASKS_CHANGED_MESSAGE } })).toBeTrue();
      expect(isStaleAskClosureError({ status: 400, error: { title: ASK_CLOSURE_MISSING_MESSAGE } })).toBeTrue();
    });

    it('is false for any other error', () => {
      expect(isStaleAskClosureError({ status: 400, error: { title: 'The column does not belong to this board.' } })).toBeFalse();
      expect(isStaleAskClosureError({ status: 403, error: { title: ASKS_CHANGED_MESSAGE } })).toBeFalse();
      expect(isStaleAskClosureError(null)).toBeFalse();
    });
  });

  describe('askErrorMessage', () => {
    it('prefers the first field error, then the title, then the fallback', () => {
      expect(askErrorMessage({ error: { errors: { Note: ['Say what you\'re asking for'] }, title: 'Invalid ask request' } }))
        .toBe('Say what you\'re asking for');
      expect(askErrorMessage({ error: { errors: null, title: 'You can\'t ask yourself.' } })).toBe('You can\'t ask yourself.');
      expect(askErrorMessage({ status: 0 }, 'Offline')).toBe('Offline');
    });
  });

  it('timeAgo reads minutes, hours and days', () => {
    const now = new Date('2026-10-16T12:00:00Z');

    expect(timeAgo('2026-10-16T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-16T11:59:00Z', now)).toBe('1 minute ago');
    expect(timeAgo('2026-10-16T11:15:00Z', now)).toBe('45 minutes ago');
    expect(timeAgo('2026-10-16T11:00:00Z', now)).toBe('1 hour ago');
    expect(timeAgo('2026-10-16T09:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-10-15T11:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo('2026-10-10T08:00:00Z', now)).toBe('6 days ago');
    expect(timeAgo(null, now)).toBeNull();
  });

  // Dates built with local constructors, so the year boundary is the viewer's own whatever the
  // machine's timezone.
  it('askDateFormat leaves the year out only within the current local year', () => {
    const now = new Date(2026, 0, 1, 0, 30);

    expect(askDateFormat(new Date(2026, 0, 1, 0, 10).toISOString(), now)).toBe('d MMM, HH:mm');
    expect(askDateFormat(new Date(2025, 11, 31, 23, 50).toISOString(), now)).toBe('d MMM y, HH:mm');
    expect(askDateFormat(new Date(2027, 0, 1, 0, 0).toISOString(), now)).toBe('d MMM y, HH:mm');
  });

  it('isNudgeTooSoonError recognises only the server\'s cooldown rejection', () => {
    expect(isNudgeTooSoonError({ status: 400, error: { title: NUDGE_TOO_SOON_MESSAGE } })).toBeTrue();
    expect(NUDGE_TOO_SOON_MESSAGE).toBe('This ask was already nudged in the last 24 hours.');
    expect(isNudgeTooSoonError({ status: 400, error: { title: 'Someone nudged or changed this ask at the same moment; reload it.' } })).toBeFalse();
    expect(isNudgeTooSoonError({ status: 403, error: { title: NUDGE_TOO_SOON_MESSAGE } })).toBeFalse();
  });

  it('keeps the action numbers the API uses', () => {
    expect(AskAction.CompleteOnBehalf).toBe(11);
    expect(AskState.Cancelled).toBe(4);
  });
});
