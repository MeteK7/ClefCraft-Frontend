import { APIRequestContext, APIResponse, request, test as setup, expect } from '@playwright/test';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import {
  API_URL,
  APP_ORIGIN,
  AUTH_DIR,
  DISPLAY_NAMES,
  Role,
  RunInfo,
  RunUser,
  StoredRole,
  storageStatePath,
  writeRunInfo
} from './support/run';

/**
 * Creates this run's users and their stored browser sessions.
 *
 * Every run registers fresh users, so runs never share data. /Auth/register and /Auth/login are
 * rate-limited to 10 requests per minute per IP, and register returns no tokens, so this makes
 * 4 registrations + 3 logins. The session user is only ever signed in through the UI, by
 * auth.spec.ts: 8 limited requests per run in total.
 */

const ROLES: Role[] = ['owner', 'collaborator', 'session', 'visual'];
const STORED_ROLES: StoredRole[] = ['owner', 'collaborator', 'visual'];

/** The access token must outlive the suite (about 3-4 min), because the API helper never refreshes. */
const MIN_ACCESS_TOKEN_MINUTES = 10;

setup('register this run\'s users and store their sessions', async () => {
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });

  const runId = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  const info: RunInfo = { runId, users: {} as Record<Role, RunUser>, limitedRequests: [] };

  for (const role of ROLES) {
    const { firstName, lastName } = DISPLAY_NAMES[role];
    info.users[role] = {
      role,
      id: '',
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email: `e2e-${role}-${runId}@test.example`,
      userName: `e2e-${role}-${runId}`,
      // Meets the Identity password policy: upper, lower, digit, symbol, 6+ characters.
      password: `E2e!${crypto.randomBytes(9).toString('base64url')}9a`
    };
  }

  const http = await request.newContext({ baseURL: `${API_URL}/`, ignoreHTTPSErrors: true });
  try {
    for (const role of ROLES) {
      const user = info.users[role];
      const response = await limitedPost(http, info, 'register', role, {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userName: user.userName,
        password: user.password
      });
      user.id = (await response.json()).userId;
      expect(user.id, `user id for ${role}`).toBeTruthy();
    }

    for (const role of STORED_ROLES) {
      const user = info.users[role];
      const response = await limitedPost(http, info, 'login', role, { email: user.email, password: user.password });
      const session = await response.json();

      assertAccessTokenLifetime(session.token);

      // The same keys AuthService.setSession writes, so the app starts signed in.
      const state = {
        cookies: [],
        origins: [
          {
            origin: APP_ORIGIN,
            localStorage: [
              { name: 'token', value: session.token },
              { name: 'refreshToken', value: session.refreshToken },
              { name: 'refreshTokenExpiresAt', value: session.refreshTokenExpiresAt }
            ]
          }
        ]
      };
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      fs.writeFileSync(storageStatePath(role), JSON.stringify(state, null, 2));
    }
  } finally {
    await http.dispose();
    writeRunInfo(info);
  }
});

/** POST to a rate-limited endpoint; on a 429, wait for Retry-After (or 60 s) and retry once. */
async function limitedPost(
  http: APIRequestContext,
  info: RunInfo,
  endpoint: 'register' | 'login',
  role: Role,
  data: unknown
): Promise<APIResponse> {
  for (let attempt = 1; ; attempt++) {
    const response = await http.post(`Auth/${endpoint}`, { data });
    info.limitedRequests.push({ endpoint, role, at: new Date().toISOString() });

    if (response.status() === 429 && attempt === 1) {
      const retryAfter = Number(response.headers()['retry-after']) || 60;
      console.warn(`${endpoint} for ${role} hit the auth rate limit (10/min/IP); retrying in ${retryAfter} s.`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    if (!response.ok()) {
      throw new Error(`${endpoint} for ${role} failed: ${response.status()} ${await response.text()}`);
    }
    return response;
  }
}

/** The token has no iat claim; it was issued just now, so its remaining lifetime is its lifetime. */
function assertAccessTokenLifetime(token: string): void {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
  const minutes = Math.round((payload.exp - Date.now() / 1000) / 60);
  if (!(minutes >= MIN_ACCESS_TOKEN_MINUTES)) {
    throw new Error(
      `The API issues access tokens valid for about ${minutes} minutes; the suite needs at least ${MIN_ACCESS_TOKEN_MINUTES}. ` +
        'Is it running with short token lifetimes (e.g. the clefcraft-api-short-tokens launch config)? Use the normal https profile.'
    );
  }
}
