import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  Board,
  Column,
  Item,
  Priority,
  Status,
  Tag,
} from '../models/board-state.model';
import { BoardView, toBoardView } from '../models/board-view.model';
import { BoardColumnView, toBoardColumnView } from '../models/board-column-view.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class BoardEngineService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ---------------------------------------------------------------------
  // Boards
  // ---------------------------------------------------------------------

  getBoards(): Observable<Board[]> {
    return this.http.get<Board[]>(`${this.apiUrl}/Boards`, { withCredentials: true });
  }

  /** Same as getBoards(), but already mapped to view-models */
  getBoardViews(): Observable<BoardView[]> {
    return this.getBoards().pipe(map(boards => boards.map(toBoardView)));
  }

  // ---------------------------------------------------------------------
  // Columns / Items
  // ---------------------------------------------------------------------

  getBoardItemsByBoardId(boardId: number): Observable<Column[]> {
    return this.http.get<Column[]>(
      `${this.apiUrl}/BoardItems/GetBoardItemsByBoardId/${boardId}`,
      { withCredentials: true }
    );
  }

  /** Same as getBoardItemsByBoardId(), but already mapped to column view-models */
  getBoardColumnViews(boardId: number): Observable<BoardColumnView[]> {
    return this.getBoardItemsByBoardId(boardId).pipe(
      map(columns => columns.map(toBoardColumnView))
    );
  }

  createBoardItem(item: Partial<Item>): Observable<Item> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    return this.http.post<Item>(`${this.apiUrl}/BoardItems/Create`, item, {
      headers,
      withCredentials: true,
    });
  }

  updateBoardItem(item: Item): Observable<Item> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    return this.http.put<Item>(`${this.apiUrl}/BoardItems/${item.id}`, item, {
      headers,
      withCredentials: true,
    });
  }

  switchBoardItemColumn(item: { id: number; boardColumnId: number }): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    return this.http.post<any>(`${this.apiUrl}/BoardItems/SwitchColumn`, item, {
      headers,
      withCredentials: true,
    });
  }

  deleteBoardItem(itemId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/BoardItems/Delete/${itemId}`, {
      withCredentials: true,
    });
  }

  updateItem(item: Item): Observable<Item> {
    return this.http.put<Item>(`${this.apiUrl}/BoardItems/Update`, item, {
      withCredentials: true,
    });
  }

  deleteItem(itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/BoardItems/Delete/${itemId}`, {
      withCredentials: true,
    });
  }

  // ---------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------

  getTags(boardId: number): Observable<Tag[]> {
    return this.http.get<Tag[]>(`${this.apiUrl}/BoardItems/GetTags?boardId=${boardId}`, {
      withCredentials: true,
    });
  }

  getStatuses(boardId: number): Observable<Status[]> {
    return this.http.get<Status[]>(
      `${this.apiUrl}/BoardItems/GetStatuses?boardId=${boardId}`,
      { withCredentials: true }
    );
  }

  getPriorities(boardId: number): Observable<Priority[]> {
    return this.http.get<Priority[]>(
      `${this.apiUrl}/BoardItems/GetPriorities?boardId=${boardId}`,
      { withCredentials: true }
    );
  }

  // ---------------------------------------------------------------------
  // UI-only no-ops carried over from BoardService
  // ---------------------------------------------------------------------

  closeSidebar(): void {
    // Logic to close sidebar
  }

  saveChanges(): void {
    // Logic to save the item changes
  }
}
