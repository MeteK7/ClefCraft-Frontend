import * as fs from 'node:fs';
import { APIRequestContext, APIResponse, request } from '@playwright/test';
import { API_URL, APP_ORIGIN, StoredRole, storageStatePath } from './run';

/**
 * Test-data client for the ClefCraft API, acting as one user.
 *
 * It authenticates with that user's ACCESS token only and never calls /Auth/refresh: refresh
 * tokens rotate, and the browser context stored in the same .auth file depends on the current
 * one. Presenting a rotated token revokes every session the user has. A 401 therefore fails
 * loudly instead of refreshing.
 */
export class ApiClient {
  private constructor(
    private readonly role: StoredRole,
    private readonly http: APIRequestContext
  ) {}

  static async forRole(role: StoredRole): Promise<ApiClient> {
    const token = readStoredValue(role, 'token');
    const http = await request.newContext({
      baseURL: `${API_URL}/`,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` }
    });
    return new ApiClient(role, http);
  }

  async dispose(): Promise<void> {
    await this.http.dispose();
  }

  // ---- Boards -----------------------------------------------------------------------------

  /** Creates a board; the API adds the default columns and makes the creator a member. */
  createBoard(title: string): Promise<BoardDto> {
    return this.send('POST', 'Boards', { title });
  }

  addBoardMember(boardId: number, userId: string): Promise<unknown> {
    return this.send('POST', `Boards/${boardId}/Members`, { userId });
  }

  getStatuses(boardId: number): Promise<NamedDto[]> {
    return this.send('GET', `BoardItems/GetStatuses?boardId=${boardId}`);
  }

  getPriorities(boardId: number): Promise<NamedDto[]> {
    return this.send('GET', `BoardItems/GetPriorities?boardId=${boardId}`);
  }

  /** The board's columns in lane order, each with its items. */
  getColumns(boardId: number): Promise<BoardColumnDto[]> {
    return this.send('GET', `BoardItems/GetBoardItemsByBoardId/${boardId}`);
  }

  async createItem(item: {
    boardId: number;
    column: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
  }): Promise<BoardItemDto> {
    const columns = await this.getColumns(item.boardId);
    const column = columns.find(c => c.title === item.column);
    if (!column) throw new Error(`Board ${item.boardId} has no column "${item.column}".`);

    return this.send('POST', 'BoardItems/Create', {
      boardId: item.boardId,
      boardColumnId: column.id,
      title: item.title,
      description: item.description ?? '',
      statusId: await this.idByName(this.getStatuses(item.boardId), item.status, 'status'),
      priorityId: await this.idByName(this.getPriorities(item.boardId), item.priority, 'priority')
    });
  }

  /** Assigns an item to a board member (the API keeps every field sent as null). */
  assignItem(item: BoardItemDto, assigneeId: string): Promise<unknown> {
    return this.send('PUT', `BoardItems/${item.id}`, { id: item.id, boardColumnId: item.boardColumnId, assigneeId });
  }

  // ---- Calendar ---------------------------------------------------------------------------

  createEvent(event: {
    subject: string;
    start: Date;
    end: Date;
    allDay?: boolean;
    location?: string;
    reminderMinutes?: number[];
    recurrence?: { frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; interval?: number; daysOfWeek?: number[]; count?: number };
  }): Promise<CalendarEventDto> {
    return this.send('POST', 'Calendar', {
      subject: event.subject,
      location: event.location ?? null,
      startDate: event.start.toISOString(),
      endDate: event.end.toISOString(),
      allDayEvent: event.allDay ?? false,
      importance: 1,
      timeZoneId: 'UTC',
      reminderMinutes: event.reminderMinutes ?? [],
      isRecurring: !!event.recurrence,
      recurrenceRuleJson: event.recurrence
        ? JSON.stringify({
            Frequency: event.recurrence.frequency,
            Interval: event.recurrence.interval ?? 1,
            DaysOfWeek: event.recurrence.daysOfWeek ?? null,
            Count: event.recurrence.count ?? null
          })
        : null
    });
  }

  getEvents(rangeStart: Date, rangeEnd: Date): Promise<CalendarEventDto[]> {
    const query = `rangeStart=${encodeURIComponent(rangeStart.toISOString())}&rangeEnd=${encodeURIComponent(rangeEnd.toISOString())}`;
    return this.send('GET', `Calendar/events?${query}`);
  }

  // ---- Plumbing ---------------------------------------------------------------------------

  private async idByName(list: Promise<NamedDto[]>, name: string, kind: string): Promise<number> {
    const matches = (await list).filter(x => x.name === name);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${kind} named "${name}", found ${matches.length}.`);
    return matches[0].id;
  }

  private async send<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, data?: unknown): Promise<T> {
    const response: APIResponse = await this.http.fetch(url, { method, data });

    if (response.status() === 401) {
      throw new Error(
        `API helper got 401 for ${this.role} on ${method} ${url}: the access token from auth.setup expired or was revoked. ` +
          'The helper never refreshes (that would rotate the browser session\'s token chain); rerun the suite.'
      );
    }
    if (!response.ok()) {
      throw new Error(`${method} ${url} as ${this.role} failed: ${response.status()} ${await response.text()}`);
    }

    const body = await response.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }
}

/** Reads one localStorage value of the app origin from a role's stored browser session. */
export function readStoredValue(role: StoredRole, key: string): string {
  const state = JSON.parse(fs.readFileSync(storageStatePath(role), 'utf-8')) as StorageStateFile;
  const value = state.origins.find(o => o.origin === APP_ORIGIN)?.localStorage.find(e => e.name === key)?.value;
  if (!value) throw new Error(`The stored session for ${role} has no "${key}".`);
  return value;
}

interface StorageStateFile {
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
}

export interface NamedDto {
  id: number;
  name: string;
}

export interface BoardDto {
  id: number;
  title: string;
}

export interface BoardItemDto {
  id: number;
  title: string;
  boardId: number;
  boardColumnId: number;
  status?: NamedDto;
  priority?: NamedDto;
}

export interface BoardColumnDto {
  id: number;
  title: string;
  boardItems: BoardItemDto[] | null;
}

export interface CalendarEventDto {
  id: number;
  baseEventId: number;
  seriesUid?: string | null;
  occurrenceDate?: string | null;
  subject: string;
  startDate: string;
  endDate: string;
  allDayEvent: boolean;
}
