import { Browser, BrowserContext, Locator, Page, Response, test as base } from '@playwright/test';
import * as fs from 'node:fs';
import { ApiClient } from './api';
import { APP_ORIGIN, RunInfo, StoredRole, readRunInfo, storageStatePath } from './run';

/** The localStorage keys of a session (AuthService.setSession); nothing else is carried between tests. */
const SESSION_KEYS = ['token', 'refreshToken', 'refreshTokenExpiresAt'];

interface Fixtures {
  run: RunInfo;
  /** The API client acting as a user (access token only, never refreshes), created on first use. */
  api: (role: StoredRole) => Promise<ApiClient>;
  ownerPage: Page;
  collaboratorPage: Page;
  visualPage: Page;
}

export const test = base.extend<Fixtures>({
  run: async ({}, use) => {
    await use(readRunInfo());
  },

  api: async ({}, use) => {
    const clients = new Map<StoredRole, Promise<ApiClient>>();
    await use(role => {
      if (!clients.has(role)) clients.set(role, ApiClient.forRole(role));
      return clients.get(role)!;
    });
    for (const client of clients.values()) await (await client).dispose();
  },

  ownerPage: async ({ browser }, use) => {
    await useRolePage(browser, 'owner', use);
  },
  collaboratorPage: async ({ browser }, use) => {
    await useRolePage(browser, 'collaborator', use);
  },
  visualPage: async ({ browser }, use) => {
    await useRolePage(browser, 'visual', use);
  }
});

export { expect } from '@playwright/test';

/**
 * A page signed in as `role`, from that role's stored session. Afterwards the session is written
 * back so the next test starts from the latest (possibly rotated) refresh token; presenting a
 * rotated token would revoke all of the user's sessions. Nothing is written back when the page
 * no longer holds a refresh token (signed out, never loaded, failed early), so a stored session
 * can never be replaced by an empty one.
 */
async function useRolePage(browser: Browser, role: StoredRole, use: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext({ storageState: storageStatePath(role) });
  const page = await context.newPage();
  try {
    await use(page);
  } finally {
    await writeBackSession(context, role);
    await context.close();
  }
}

async function writeBackSession(context: BrowserContext, role: StoredRole): Promise<void> {
  const state = await context.storageState();
  const current = state.origins.find(o => o.origin === APP_ORIGIN)?.localStorage ?? [];
  const session = current.filter(e => SESSION_KEYS.includes(e.name) && e.value);
  if (!session.some(e => e.name === 'refreshToken')) return;

  const file = storageStatePath(role);
  const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const origin = stored.origins.find((o: { origin: string }) => o.origin === APP_ORIGIN);
  origin.localStorage = session.map(({ name, value }) => ({ name, value }));
  fs.writeFileSync(file, JSON.stringify(stored, null, 2));
}

/**
 * Creates a board (with the API's default columns) and items on it, as the client's user.
 * Returns the board id and the item ids keyed by title.
 */
export async function boardWithItems(
  api: ApiClient,
  title: string,
  items: { title: string; column?: string; status?: string; priority?: string; description?: string }[]
): Promise<{ boardId: number; itemIds: Record<string, number> }> {
  const board = await api.createBoard(title);
  const itemIds: Record<string, number> = {};
  for (const item of items) {
    const created = await api.createItem({
      boardId: board.id,
      title: item.title,
      column: item.column ?? 'Backlog',
      status: item.status ?? item.column ?? 'Backlog',
      priority: item.priority ?? 'Medium',
      description: item.description
    });
    itemIds[item.title] = created.id;
  }
  return { boardId: board.id, itemIds };
}

/**
 * Resolves once the page's SignalR hub has negotiated. Call it BEFORE the navigation that opens
 * the connection, and await the result before triggering anything realtime.
 */
export function hubNegotiated(page: Page): Promise<Response> {
  return page.waitForResponse(r => r.url().includes('/hubs/notifications/negotiate') && r.ok(), { timeout: 30_000 });
}

/**
 * Drags `source` onto `target` with real mouse events in small steps. CDK drag-drop only starts a
 * drag after the pointer moves a few pixels, and needs intermediate moves to track the drop list.
 */
export async function dragTo(page: Page, source: Locator, target: Locator | { x: number; y: number }, steps = 12): Promise<void> {
  const from = await centerOf(source);
  const to = 'x' in target ? target : await centerOf(target);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.move(to.x + 1, to.y + 1);
  await page.mouse.up();
}

/**
 * Presses on `handle` and moves the pointer by (dx, dy) pixels in small steps before releasing.
 * For the calendar's week/day grids, which track raw mouse moves (80 px per hour, 15-minute snap).
 */
export async function dragBy(page: Page, handle: Locator, dx: number, dy: number, steps = 10): Promise<void> {
  const from = await centerOf(handle);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  await page.mouse.up();
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No bounding box for ${locator}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Accepts the next native window.confirm (Playwright otherwise dismisses it, which means "Cancel"). */
export function acceptNextConfirm(page: Page): void {
  page.once('dialog', dialog => void dialog.accept());
}
