import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { AskEventPayload } from './notification-realtime.service';

/** Events arriving within this window of the first one show as one toast. */
export const ASK_TOAST_GROUP_MS = 3_000;

/** The longest a toast waits for the user to stop typing. */
export const ASK_TOAST_MAX_HOLD_MS = 30_000;

/** How long visible tabs gather each other's claims to one event before the lowest id shows it. */
export const ASK_TOAST_CLAIM_MS = 150;

/** How long another tab's claim is remembered, waiting for the same event to arrive here. */
export const ASK_TOAST_FOREIGN_CLAIM_MS = 5_000;

export const ASK_TOAST_CHANNEL = 'clefcraft-ask-toasts';

/** One event, the same in every tab of the user that received it. */
export function askEventKey(event: AskEventPayload): string {
  return `${event.askId}|${event.event}|${event.occurredAt}`;
}

/** Focus is somewhere the user types: a field, a text area or a rich-text editor. */
export function isTyping(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(element.type);
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

interface Claim {
  key: string;
  tabId: string;
}

/**
 * Decides when, and in which tab, ask events become toasts, so they arrive as a chime rather than
 * a stream of interruptions:
 * - only a visible tab shows them; when several are visible (two windows), the tabs agree over a
 *   BroadcastChannel: the first to claim an event shows it, the lowest id among tabs claiming it
 *   together, so no toast shows twice; without the channel, each visible tab shows its own;
 * - events within a few seconds of each other come out as one batch;
 * - while the user is typing, the batch waits until focus leaves the field, for half a minute at
 *   most.
 * The "Waiting for you" badge, not a toast, is what keeps track of everything.
 */
@Injectable({ providedIn: 'root' })
export class AskToastCoordinator implements OnDestroy {
  private readonly batchesSubject = new Subject<AskEventPayload[]>();

  /** Batches ready to show: one event, or several that arrived together. */
  readonly batches$: Observable<AskEventPayload[]> = this.batchesSubject.asObservable();

  readonly tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  private readonly channel: BroadcastChannel | null =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(ASK_TOAST_CHANNEL);
  private readonly claims = new Map<string, Set<string>>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  private buffer: AskEventPayload[] = [];
  /** Which batch is being gathered: a batch's timers act on it only. */
  private batch = 0;
  private waitingForFocusOut = false;

  constructor() {
    if (this.channel) {
      this.channel.onmessage = (message: MessageEvent<Claim>) => {
        const { key, tabId } = message.data;
        this.recordClaim(key, tabId);
        // Forgotten if the event never reaches this tab.
        this.later(() => {
          if (!this.claims.get(key)?.has(this.tabId)) this.claims.delete(key);
        }, ASK_TOAST_FOREIGN_CLAIM_MS);
      };
    }
  }

  /** An event the user should hear about, unless another tab shows it. */
  offer(event: AskEventPayload): void {
    if (document.visibilityState !== 'visible') return;

    if (!this.channel) {
      this.add(event);
      return;
    }

    const key = askEventKey(event);
    // Another tab claimed it before it got here: that tab shows it.
    if (this.claims.has(key)) {
      this.claims.delete(key);
      return;
    }

    this.recordClaim(key, this.tabId);
    this.channel.postMessage({ key, tabId: this.tabId } satisfies Claim);

    this.later(() => {
      const claimants = [...(this.claims.get(key) ?? [])].sort();
      this.claims.delete(key);
      if (claimants[0] === this.tabId) this.add(event);
    }, ASK_TOAST_CLAIM_MS);
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    document.removeEventListener('focusout', this.onFocusOut);
    this.channel?.close();
  }

  private recordClaim(key: string, tabId: string): void {
    const claimants = this.claims.get(key) ?? new Set<string>();
    claimants.add(tabId);
    this.claims.set(key, claimants);
  }

  private add(event: AskEventPayload): void {
    if (this.buffer.length === 0) {
      const batch = ++this.batch;
      this.later(() => batch === this.batch && this.flush(), ASK_TOAST_GROUP_MS);
      // However long the user keeps typing, the batch comes out in the end.
      this.later(() => batch === this.batch && this.flush(true), ASK_TOAST_MAX_HOLD_MS);
    }
    this.buffer.push(event);
  }

  private flush(force = false): void {
    if (this.buffer.length === 0) return;

    if (!force && isTyping(document.activeElement)) {
      if (!this.waitingForFocusOut) {
        this.waitingForFocusOut = true;
        document.addEventListener('focusout', this.onFocusOut);
      }
      return;
    }

    document.removeEventListener('focusout', this.onFocusOut);
    this.waitingForFocusOut = false;
    const events = this.buffer;
    this.buffer = [];
    // The next event starts a new batch; this one's timers no longer apply.
    this.batch++;
    this.batchesSubject.next(events);
  }

  // Once focus has moved on (to another field, perhaps): check again.
  private readonly onFocusOut = (): void => {
    this.later(() => this.flush(), 0);
  };

  private later(run: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
  }
}
