import {
  ASKS_CHANGED_MESSAGE,
  ASK_CLOSURE_MISSING_MESSAGE,
  ASK_ANSWER_REQUIRED_CODE,
  ASK_EXACT_TIME_FORMAT,
  AskAction,
  AskCancelReason,
  AskState,
  NUDGE_TOO_SOON_MESSAGE,
  askDayFormat,
  askErrorMessage,
  askKeyDates,
  askStatusLine,
  askViewpoint,
  asksToReview,
  buildAskClosure,
  isAnswerRequiredError,
  isNudgeTooSoonError,
  parseReplyBody,
  replyExcerpt,
  isStaleAskClosureError,
  isWithinDay,
  timeAgo,
  toAskSummary,
  toContributors
} from './board-item-ask.model';
import { makeAsk } from './board-item-ask.testing';

describe('board-item-ask model', () => {
  describe('toContributors', () => {
    const done = (id: number, recipient: string, completedAt: string, note = `ask ${id}`) => makeAsk({
      id, state: AskState.Completed, recipientUserId: recipient, recipientFullName: `${recipient} name`, completedAt, note
    });

    it('credits the recipients of done asks only', () => {
      const contributors = toContributors([
        done(1, 'ayse', '2026-10-20T10:00:00Z'),
        makeAsk({ id: 2, state: AskState.Declined, recipientUserId: 'bo' }),
        makeAsk({ id: 3, state: AskState.Cancelled, recipientUserId: 'cy' }),
        makeAsk({ id: 4, state: AskState.Accepted, recipientUserId: 'di' }),
        makeAsk({ id: 5, state: AskState.Pending, recipientUserId: 'ed' })
      ]);

      expect(contributors.map(c => c.userId)).toEqual(['ayse']);
      expect(contributors[0]).toEqual({
        userId: 'ayse', fullName: 'ayse name', asks: [{ askId: 1, note: 'ask 1', completedAt: '2026-10-20T10:00:00Z' }]
      });
    });

    it('groups each person\'s asks, newest first, and orders people by their latest contribution', () => {
      const contributors = toContributors([
        done(1, 'ayse', '2026-10-18T10:00:00Z'),
        done(2, 'bo', '2026-10-21T10:00:00Z'),
        done(3, 'ayse', '2026-10-22T10:00:00Z'),
        done(4, 'bo', '2026-10-19T10:00:00Z')
      ]);

      expect(contributors.map(c => [c.userId, c.asks.map(a => a.askId)])).toEqual([['ayse', [3, 1]], ['bo', [2, 4]]]);
    });

    it('credits the recipient when the requester marked the ask done', () => {
      const contributors = toContributors([
        makeAsk({ ...done(1, 'ayse', '2026-10-20T10:00:00Z'), completedByUserId: 'requester', completedByFullName: 'Rae Requester' })
      ]);

      expect(contributors.map(c => c.userId)).toEqual(['ayse']);
    });

    it('is empty without done asks', () => {
      expect(toContributors([])).toEqual([]);
      expect(toContributors([makeAsk({ state: AskState.Pending })])).toEqual([]);
    });
  });

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

  it('isWithinDay is true up to 24 hours ago, including a time slightly ahead of the clock', () => {
    const now = new Date('2026-10-18T16:48:00Z');

    expect(isWithinDay('2026-10-17T16:49:00Z', now)).toBeTrue();
    expect(isWithinDay('2026-10-17T16:48:00Z', now)).toBeTrue();
    expect(isWithinDay('2026-10-17T16:47:00Z', now)).toBeFalse();
    expect(isWithinDay('2026-10-18T16:48:30Z', now)).toBeTrue();
    expect(isWithinDay(null, now)).toBeFalse();
    expect(isWithinDay('not a date', now)).toBeFalse();
  });

  it('shows exact times with the year', () => {
    expect(ASK_EXACT_TIME_FORMAT).toBe('d MMM y, HH:mm');
  });

  it('isNudgeTooSoonError recognises only the server\'s cooldown rejection', () => {
    expect(isNudgeTooSoonError({ status: 400, error: { title: NUDGE_TOO_SOON_MESSAGE } })).toBeTrue();
    expect(NUDGE_TOO_SOON_MESSAGE).toBe('This ask was already nudged in the last 24 hours.');
    expect(isNudgeTooSoonError({ status: 400, error: { title: 'Someone nudged or changed this ask at the same moment; reload it.' } })).toBeFalse();
    expect(isNudgeTooSoonError({ status: 403, error: { title: NUDGE_TOO_SOON_MESSAGE } })).toBeFalse();
  });

  describe('parseReplyBody', () => {
    it('splits text and fenced code, dropping the language word and the fence line breaks', () => {
      expect(parseReplyBody('Here:\n```sql\nSELECT *\n  FROM items;\n```\nThanks')).toEqual([
        { kind: 'text', text: 'Here:' },
        { kind: 'code', text: 'SELECT *\n  FROM items;' },
        { kind: 'text', text: 'Thanks' }
      ]);
    });

    it('keeps a first line of code written on the fence line', () => {
      expect(parseReplyBody('```BEGIN;\nCOMMIT;```')).toEqual([{ kind: 'code', text: 'BEGIN;\nCOMMIT;' }]);
      expect(parseReplyBody('```SELECT 1;```')).toEqual([{ kind: 'code', text: 'SELECT 1;' }]);
    });

    it('leaves an unclosed fence, and plain text, as text', () => {
      expect(parseReplyBody('Use ```this')).toEqual([{ kind: 'text', text: 'Use ```this' }]);
      expect(parseReplyBody('Line one\nLine two')).toEqual([{ kind: 'text', text: 'Line one\nLine two' }]);
    });

    it('handles several blocks and skips empty ones', () => {
      expect(parseReplyBody('```\na\n```\n```\n```\n```\nb\n```')).toEqual([
        { kind: 'code', text: 'a' },
        { kind: 'code', text: 'b' }
      ]);
    });
  });

  it('replyExcerpt puts a reply on one line', () => {
    expect(replyExcerpt('```sql\nSELECT 1;\n```\nDone')).toBe('SELECT 1; Done');
    expect(replyExcerpt('x'.repeat(130), 120)).toBe('x'.repeat(120) + '…');
  });

  it('isAnswerRequiredError recognises the answer gate by its code', () => {
    expect(isAnswerRequiredError({ status: 400, error: { code: ASK_ANSWER_REQUIRED_CODE, title: 'Anything' } })).toBeTrue();
    expect(isAnswerRequiredError({ status: 400, error: { title: 'This ask expects an answer.' } })).toBeFalse();
    expect(isAnswerRequiredError({ status: 403, error: { code: ASK_ANSWER_REQUIRED_CODE } })).toBeFalse();
  });

  describe('the status line and key dates', () => {
    it('gives each state one fact, and the latest nudge only while it waits', () => {
      const asked = '2026-10-18T13:48:00Z';
      const nudged = '2026-10-18T13:49:00Z';

      expect(askStatusLine(makeAsk({ state: AskState.Pending, dateCreated: asked, lastNudgedAt: nudged })))
        .toEqual([{ label: 'Asked', iso: asked }, { label: 'nudged', iso: nudged }]);
      expect(askStatusLine(makeAsk({ state: AskState.Accepted, respondedAt: '2026-10-19T17:29:00Z', lastNudgedAt: nudged })))
        .toEqual([{ label: 'Accepted', iso: '2026-10-19T17:29:00Z' }]);
      expect(askStatusLine(makeAsk({ state: AskState.Completed, completedAt: '2026-10-21T15:39:00Z' })))
        .toEqual([{ label: 'Done', iso: '2026-10-21T15:39:00Z' }]);
      expect(askStatusLine(makeAsk({ state: AskState.Cancelled, cancelReason: AskCancelReason.Withdrawn })))
        .toEqual([{ label: 'Withdrawn', iso: null }]);
    });

    it('lists the key dates in the order they happened: a nudge before the accept comes before it', () => {
      const dates = askKeyDates(makeAsk({
        state: AskState.Completed,
        dateCreated: '2026-10-18T13:48:00Z',
        respondedAt: '2026-10-19T17:29:00Z',
        completedAt: '2026-10-21T15:39:00Z',
        lastNudgedAt: '2026-10-18T13:49:00Z'
      }));

      expect(dates.map(d => d.label)).toEqual(['Asked', 'Last nudged', 'Accepted', 'Done']);
    });

    it('shows the decline with its reason, and only what the ask records', () => {
      const dates = askKeyDates(makeAsk({ state: AskState.Declined, respondedAt: '2026-10-19T09:29:00Z', responseNote: 'Out this week' }));

      expect(dates.map(d => [d.label, d.note])).toEqual([['Asked', null], ['Declined', 'Out this week']]);
    });

    it('knows whose side the viewer is on', () => {
      const ask = makeAsk({ requestedByUserId: 'rae', recipientUserId: 'ayse' });

      expect(askViewpoint(ask, 'rae')).toBe('requester');
      expect(askViewpoint(ask, 'ayse')).toBe('recipient');
      expect(askViewpoint(ask, 'someone-else')).toBe('other');
    });
  });

  it('shows an older day without the year only within the current year', () => {
    const now = new Date(2026, 9, 23);

    expect(askDayFormat(new Date(2026, 0, 2).toISOString(), now)).toBe('d MMM');
    expect(askDayFormat(new Date(2025, 11, 30).toISOString(), now)).toBe('d MMM y');
  });

  it('keeps the action numbers the API uses', () => {
    expect(AskAction.SetExpectsAnswer).toBe(12);
    expect(AskAction.ClearExpectsAnswer).toBe(13);
    expect(AskAction.CompleteOnBehalf).toBe(11);
    expect(AskState.Cancelled).toBe(4);
  });
});
