import {
  ASKS_CHANGED_MESSAGE,
  ASK_CLOSURE_MISSING_MESSAGE,
  AskAction,
  AskCancelReason,
  AskState,
  askErrorMessage,
  asksToReview,
  buildAskClosure,
  daysAgo,
  isStaleAskClosureError,
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

  it('daysAgo reads whole days', () => {
    const now = new Date('2026-10-16T12:00:00Z');

    expect(daysAgo('2026-10-16T08:00:00Z', now)).toBe('today');
    expect(daysAgo('2026-10-15T08:00:00Z', now)).toBe('1 day ago');
    expect(daysAgo('2026-10-10T08:00:00Z', now)).toBe('6 days ago');
    expect(daysAgo(null, now)).toBeNull();
  });

  it('keeps the action numbers the API uses', () => {
    expect(AskAction.CompleteOnBehalf).toBe(11);
    expect(AskState.Cancelled).toBe(4);
  });
});
