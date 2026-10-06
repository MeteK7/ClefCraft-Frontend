import { Page, Request } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { recordLimitedRequest } from './support/run';

interface StoredSession {
  token: string | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: string | null;
}

const storedSession = (page: Page): Promise<StoredSession> =>
  page.evaluate(() => ({
    token: localStorage.getItem('token'),
    refreshToken: localStorage.getItem('refreshToken'),
    refreshTokenExpiresAt: localStorage.getItem('refreshTokenExpiresAt')
  }));

/** An access token whose exp is an hour in the past. Unsigned: the API rejects it with 401 either way. */
function expiredAccessToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) - 3600;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp })}.expired-test-token`;
}

// The session user ("Cem Session") is used only here, in a fresh context with no stored session
// that is never written back. Logout revokes only the refresh token it presents
// (AuthService.Logout), so nothing here can affect another test's session.
test('sign in through the UI, refresh an expired access token once, then sign out', async ({ browser, run }) => {
  const user = run.users.session;
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. A protected page redirects an anonymous visitor to the locked workspace.
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/protected\?returnUrl=%2Fcalendar$/);
    await expect(page.getByRole('heading', { name: 'Workspace Locked' })).toBeVisible();

    // 2. Sign in through the login form; it returns to the requested page.
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.locator('input[formControlName="email"]').fill(user.email);
    await page.locator('input[formControlName="password"]').fill(user.password);

    const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/Auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    expect((await loginResponse).status()).toBe(200);
    recordLimitedRequest('login', 'session');

    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.locator('.user-info')).toContainText(user.fullName);
    await expect(page.getByRole('button', { name: /Sign Out/ })).toBeVisible();

    // 3. An expired access token is refreshed with the refresh token, exactly once.
    await page.evaluate(token => localStorage.setItem('token', token), expiredAccessToken());
    const before = await storedSession(page);

    const refreshes: Request[] = [];
    page.on('request', r => {
      if (r.url().endsWith('/api/Auth/refresh') && r.method() === 'POST') refreshes.push(r);
    });

    const refreshResponse = page.waitForResponse(r => r.url().endsWith('/api/Auth/refresh'));
    const eventsResponse = page.waitForResponse(r => r.url().includes('/api/Calendar/events') && r.status() === 200);
    await page.goto('/calendar');

    expect((await refreshResponse).status()).toBe(200);
    await eventsResponse;
    await page.waitForTimeout(2_000); // let any second, independent refresh attempt show up
    await expect(page).toHaveURL(/\/calendar/);

    const after = await storedSession(page);
    expect(after.token).toBeTruthy();
    expect(after.token).not.toBe(before.token);
    expect(after.refreshToken).not.toBe(before.refreshToken); // rotated

    // More than one refresh is an application finding, not something to work around here.
    expect(
      refreshes.length,
      `expected exactly one POST /api/Auth/refresh, saw ${refreshes.length} (see the trace for their initiators)`
    ).toBe(1);

    // 4. Sign out: the session is revoked and removed, and the protected page is locked again.
    const logoutResponse = page.waitForResponse(r => r.url().endsWith('/api/Auth/logout'));
    await page.getByRole('button', { name: /Sign Out/ }).click();
    expect((await logoutResponse).status()).toBe(204);
    await expect(page).toHaveURL(/\/login/);

    expect(await storedSession(page)).toEqual({ token: null, refreshToken: null, refreshTokenExpiresAt: null });

    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/protected\?returnUrl=%2Fcalendar$/);
  } finally {
    await context.close();
  }
});
