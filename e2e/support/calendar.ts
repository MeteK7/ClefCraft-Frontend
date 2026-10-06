import { Page } from '@playwright/test';
import { expect } from './fixtures';

export interface EventsRequestTracker {
  inFlight: number;
  lastActivity: number;
}

export const isEventsRequest = (url: string) => url.includes('/api/Calendar/events');

/** Counts the page's in-flight /Calendar/events requests and remembers when the last one started or ended. */
export function trackEventsRequests(page: Page): EventsRequestTracker {
  const state = { inFlight: 0, lastActivity: Date.now() };
  const settled = () => {
    state.inFlight--;
    state.lastActivity = Date.now();
  };
  page.on('request', r => {
    if (!isEventsRequest(r.url())) return;
    state.inFlight++;
    state.lastActivity = Date.now();
  });
  page.on('requestfinished', r => isEventsRequest(r.url()) && settled());
  page.on('requestfailed', r => isEventsRequest(r.url()) && settled()); // includes cancelled range fetches
  return state;
}

/** Opens the calendar on the given date and waits until its first events load has arrived. */
export async function openCalendarAt(page: Page, isoDateTime: string): Promise<EventsRequestTracker> {
  const requests = trackEventsRequests(page);
  const loaded = page.waitForResponse(r => isEventsRequest(r.url()) && r.ok());
  await page.goto(`/calendar?date=${isoDateTime}`);
  await loaded;
  await expect(page.locator('.loading-overlay')).toBeHidden();
  return requests;
}

/**
 * Waits until the month view has stopped loading weeks in the background: no events request in
 * flight, no loading indicator, and a second without new requests. The month view keeps fetching
 * neighbouring weeks after the first load and re-renders its rows when they arrive; a drag that
 * overlaps that loses its drop silently (an open finding in PLAN.md), and a screenshot would catch
 * the rows mid-update.
 */
export async function settleMonthView(page: Page, requests: EventsRequestTracker): Promise<void> {
  await expect
    .poll(() => requests.inFlight === 0 && Date.now() - requests.lastActivity >= 1_000, { timeout: 20_000 })
    .toBe(true);
  await expect(page.locator('.scroll-edge-indicator.active')).toHaveCount(0);
}
