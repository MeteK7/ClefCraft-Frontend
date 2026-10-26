import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AskDirection,
  AskStateChange,
  BoardItemAsk,
  CreateAskRequest,
  ReassignAskRequest,
  UpdateAskRequest
} from '../models/board-item-ask.model';

/** The asks endpoints (BoardItemAsksController). Every change returns the ask as it now is. */
@Injectable({ providedIn: 'root' })
export class BoardItemAskService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  /** Every ask on the item, in any state. */
  getForItem(itemId: number): Observable<BoardItemAsk[]> {
    return this.http.get<BoardItemAsk[]>(`${this.apiUrl}/BoardItems/${itemId}/asks`, { withCredentials: true });
  }

  /**
   * "Asked of you" (received), "Asks you sent" (sent) or "Waiting for you" (waiting: the asks that
   * are your move, grouped by board), across the caller's boards.
   */
  getMine(direction: AskDirection): Observable<BoardItemAsk[]> {
    return this.http.get<BoardItemAsk[]>(`${this.apiUrl}/BoardItemAsks/mine`, {
      params: { direction },
      withCredentials: true
    });
  }

  /** How many asks one of those lists holds, without loading them: the "Waiting for you" badge. */
  countMine(direction: AskDirection): Observable<number> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/BoardItemAsks/mine/count`, {
      params: { direction },
      withCredentials: true
    }).pipe(map(r => r.count));
  }

  create(itemId: number, request: CreateAskRequest): Observable<BoardItemAsk> {
    return this.http.post<BoardItemAsk>(`${this.apiUrl}/BoardItems/${itemId}/asks`, request, { withCredentials: true });
  }

  update(askId: number, request: UpdateAskRequest): Observable<BoardItemAsk> {
    return this.http.put<BoardItemAsk>(`${this.apiUrl}/BoardItemAsks/${askId}`, request, { withCredentials: true });
  }

  /** A reply body goes only with 'complete': "Send & mark done", one request. */
  changeState(
    askId: number,
    change: AskStateChange,
    expectedRevision: number,
    reason?: string | null,
    replyBody?: string | null
  ): Observable<BoardItemAsk> {
    const body = replyBody != null
      ? { expectedRevision, reason: reason ?? null, replyBody }
      : { expectedRevision, reason: reason ?? null };
    return this.http.post<BoardItemAsk>(`${this.apiUrl}/BoardItemAsks/${askId}/${change}`, body, { withCredentials: true });
  }

  /** Posts a reply; returns the ask with its replies. */
  addReply(askId: number, body: string): Observable<BoardItemAsk> {
    return this.http.post<BoardItemAsk>(`${this.apiUrl}/BoardItemAsks/${askId}/replies`, { body }, { withCredentials: true });
  }

  /** Changes the caller's own reply; returns the ask with its replies. */
  editReply(replyId: number, body: string): Observable<BoardItemAsk> {
    return this.http.put<BoardItemAsk>(`${this.apiUrl}/BoardItemAskReplies/${replyId}`, { body }, { withCredentials: true });
  }

  setExpectsAnswer(askId: number, expectedRevision: number, expectsAnswer: boolean): Observable<BoardItemAsk> {
    return this.http.post<BoardItemAsk>(
      `${this.apiUrl}/BoardItemAsks/${askId}/expects-answer`,
      { expectedRevision, expectsAnswer },
      { withCredentials: true });
  }

  nudge(askId: number): Observable<BoardItemAsk> {
    return this.http.post<BoardItemAsk>(`${this.apiUrl}/BoardItemAsks/${askId}/nudge`, null, { withCredentials: true });
  }

  /** Cancels the ask and asks someone else; returns the new ask. */
  reassign(askId: number, request: ReassignAskRequest): Observable<BoardItemAsk> {
    return this.http.post<BoardItemAsk>(`${this.apiUrl}/BoardItemAsks/${askId}/reassign`, request, { withCredentials: true });
  }
}
