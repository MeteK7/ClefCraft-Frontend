import * as fs from 'node:fs';
import * as path from 'node:path';

/** Where the backend API listens (the https launch profile of ClefCraft.Api). */
export const API_URL = 'https://localhost:7287/api';

/** The origin the SPA runs on; it is also the only origin the API's CORS policy allows. */
export const APP_ORIGIN = 'http://localhost:4200';

/** Per-run state written by auth.setup.ts. Git-ignored. */
export const AUTH_DIR = path.join(__dirname, '..', '.auth');

export type Role = 'owner' | 'collaborator' | 'session' | 'visual';

/** Roles that get a stored browser session; the session user only ever logs in through the UI. */
export type StoredRole = Exclude<Role, 'session'>;

export interface RunUser {
  role: Role;
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  userName: string;
  password: string;
}

export interface RunInfo {
  runId: string;
  users: Record<Role, RunUser>;
  /** Requests made to the rate-limited endpoints (/Auth/register, /Auth/login) during this run. */
  limitedRequests: { endpoint: 'register' | 'login'; role: Role; at: string }[];
}

export const DISPLAY_NAMES: Record<Role, { firstName: string; lastName: string }> = {
  owner: { firstName: 'Ada', lastName: 'Owner' },
  collaborator: { firstName: 'Ben', lastName: 'Collaborator' },
  session: { firstName: 'Cem', lastName: 'Session' },
  visual: { firstName: 'Dana', lastName: 'Visual' }
};

export const storageStatePath = (role: StoredRole) => path.join(AUTH_DIR, `${role}.json`);

const runInfoPath = path.join(AUTH_DIR, 'run.json');

export function writeRunInfo(info: RunInfo): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(runInfoPath, JSON.stringify(info, null, 2));
}

export function readRunInfo(): RunInfo {
  if (!fs.existsSync(runInfoPath)) {
    throw new Error(`No ${runInfoPath}: the "setup" project (auth.setup.ts) has to run first.`);
  }
  return JSON.parse(fs.readFileSync(runInfoPath, 'utf-8')) as RunInfo;
}

/** Records a call to a rate-limited endpoint, so a run can report how many it made (limit: 10/min/IP). */
export function recordLimitedRequest(endpoint: 'register' | 'login', role: Role): void {
  const info = readRunInfo();
  info.limitedRequests.push({ endpoint, role, at: new Date().toISOString() });
  writeRunInfo(info);
}
