import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';

import {
  ASK_TOAST_CHANNEL,
  ASK_TOAST_CLAIM_MS,
  ASK_TOAST_FOREIGN_CLAIM_MS,
  ASK_TOAST_GROUP_MS,
  ASK_TOAST_MAX_HOLD_MS,
  AskToastCoordinator,
  askEventKey,
  isTyping
} from './ask-toast-coordinator.service';
import { AskEventPayload } from './notification-realtime.service';

describe('AskToastCoordinator', () => {
  let coordinator: AskToastCoordinator;
  let batches: AskEventPayload[][];
  let visibility: DocumentVisibilityState;

  const event = (askId: number, overrides: Partial<AskEventPayload> = {}): AskEventPayload => ({
    askId, boardItemId: 1, boardId: 3, itemTitle: 'Release notes', event: 'Requested', actorFullName: 'Rae',
    note: 'Help', reason: null, actedOnBehalf: false, replyId: null, replyExcerpt: null,
    occurredAt: '2026-10-25T10:00:00Z', ...overrides
  });

  beforeEach(() => {
    visibility = 'visible';
    spyOnProperty(document, 'visibilityState', 'get').and.callFake(() => visibility);
    coordinator = TestBed.inject(AskToastCoordinator);
    batches = [];
    coordinator.batches$.subscribe(batch => batches.push(batch));
  });

  afterEach(() => coordinator.ngOnDestroy());

  const afterWindow = () => tick(ASK_TOAST_CLAIM_MS + ASK_TOAST_GROUP_MS);

  it('shows events that arrive within a few seconds as one batch, and later ones as the next', fakeAsync(() => {
    coordinator.offer(event(1));
    tick(1_000);
    coordinator.offer(event(2));
    afterWindow();

    coordinator.offer(event(3));
    afterWindow();
    flush();

    expect(batches.map(b => b.map(e => e.askId))).toEqual([[1, 2], [3]]);
  }));

  it('shows nothing in a hidden tab: the badge keeps count instead', fakeAsync(() => {
    visibility = 'hidden';

    coordinator.offer(event(1));
    afterWindow();
    flush();

    expect(batches).toEqual([]);
  }));

  it('holds a batch while the user types, and lets it out when focus leaves the field', fakeAsync(() => {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    field.focus();

    coordinator.offer(event(1));
    afterWindow();
    expect(batches).toEqual([]);

    field.blur();
    tick();
    expect(batches.length).toBe(1);
    field.remove();
    flush();
  }));

  it('lets a held batch out after half a minute however long the typing goes on', fakeAsync(() => {
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();

    coordinator.offer(event(1));
    tick(ASK_TOAST_CLAIM_MS + ASK_TOAST_MAX_HOLD_MS - 1);
    expect(batches).toEqual([]);
    tick(1);
    expect(batches.length).toBe(1);

    field.remove();
    flush();
  }));

  // Another visible tab of the same user claims the same event, as its BroadcastChannel message
  // would arrive here.
  const claimFromOtherTab = (tabId: string, payload: AskEventPayload) =>
    (coordinator as any).channel.onmessage(new MessageEvent('message', { data: { key: askEventKey(payload), tabId } }));

  it('leaves an event to another visible tab with a lower id', fakeAsync(() => {
    coordinator.offer(event(1));
    claimFromOtherTab('0', event(1));
    afterWindow();
    flush();

    expect(batches).toEqual([]);
  }));

  it('shows an event itself when the other visible tab has a higher id', fakeAsync(() => {
    coordinator.offer(event(1));
    claimFromOtherTab('~', event(1));
    afterWindow();
    flush();

    expect(batches.map(b => b.map(e => e.askId))).toEqual([[1]]);
  }));

  it('leaves an event to a tab that claimed it before it got here, whatever that tab\'s id', fakeAsync(() => {
    claimFromOtherTab('~', event(1));
    coordinator.offer(event(1));
    afterWindow();
    flush();

    expect(batches).toEqual([]);
  }));

  it('forgets another tab\'s claim when the event never got here', fakeAsync(() => {
    claimFromOtherTab('0', event(1));
    tick(ASK_TOAST_FOREIGN_CLAIM_MS);

    // Arriving now (a fresh push of the same event), it's this tab's to show.
    coordinator.offer(event(1));
    afterWindow();
    flush();

    expect(batches.map(b => b.map(e => e.askId))).toEqual([[1]]);
  }));

  it('tells the other tabs it claims each event, on the shared channel', fakeAsync(() => {
    const other = new BroadcastChannel(ASK_TOAST_CHANNEL);
    const post = spyOn((coordinator as any).channel as BroadcastChannel, 'postMessage').and.callThrough();

    coordinator.offer(event(1));

    expect(post).toHaveBeenCalledOnceWith({ key: askEventKey(event(1)), tabId: coordinator.tabId });
    other.close();
    afterWindow();
    flush();
  }));
});

describe('ask toast helpers', () => {
  it('identifies an event the same way in every tab', () => {
    const payload = { askId: 7, event: 'Replied', occurredAt: '2026-10-25T10:00:00Z' } as AskEventPayload;
    expect(askEventKey(payload)).toBe('7|Replied|2026-10-25T10:00:00Z');
  });

  it('knows typing from other focus', () => {
    const text = document.createElement('input');
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    document.body.append(editor);

    expect(isTyping(text)).toBeTrue();
    expect(isTyping(document.createElement('textarea'))).toBeTrue();
    expect(isTyping(editor)).toBeTrue();
    expect(isTyping(checkbox)).toBeFalse();
    expect(isTyping(document.createElement('button'))).toBeFalse();
    expect(isTyping(null)).toBeFalse();

    editor.remove();
  });
});
