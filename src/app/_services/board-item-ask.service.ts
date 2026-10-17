import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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

  /** "Asked of you" (received) or "Asks you sent" (sent), across the caller's boards. */
  getMine(direction: AskDirection): Observable<BoardItemAsk[]> {
    return this.http.get<BoardItemAsk[]>(`${this.apiUrl}/BoardItemAsks/mine`, {
      params: { direction },
      withCredentials: true
    });
  }

  create(itemId: number, request: CreateAskRequest): Observable<BoardItemAsk> {
    return this.http.post<BoardItemAsk>(`${this.apiUrl}/BoardItems/${itemId}/asks`, request, { withCredentials: true });
  }

  update(askId: number, request: UpdateAskRequest): Observable<BoardItemAsk> {
    return this.http.put<BoardItemAsk>(`${this.apiUrl}/BoardItemAsks/${askId}`, request, { withCredentials: true });
  }

  changeState(askId: number, change: AskStateChange, expectedRevision: number, reason?: string | null): Observable<BoardItemAsk> {
    return this.http.post<BoardItemAsk>(
      `${this.apiUrl}/BoardItemAsks/${askId}/${change}`,
      { expectedRevision, reason: reason ?? null },
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
