import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Board, Column, Item, Priority, Status, Tag } from '../models/board.model';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private apiUrl = 'https://localhost:7287/api'; // API base URL

  constructor(private http: HttpClient) { }

  getBoards(): Observable<Board[]> {
    return this.http.get<Board[]>(`${this.apiUrl}/Boards`, { withCredentials: true });
  }

  getBoardItemsByBoardId(boardId: number): Observable<Column[]> {
    return this.http.get<Column[]>(`${this.apiUrl}/BoardItems/GetBoardItemsByBoardId/${boardId}`, { withCredentials: true });
  }

  createBoardItem(item: Partial<Item>): Observable<Item> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post<Item>(`${this.apiUrl}/BoardItems/Create`, item, { headers, withCredentials: true });
  }

  updateBoardItem(item: Item): Observable<Item> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.put<Item>(`${this.apiUrl}/BoardItems/${item.id}`, item, { headers, withCredentials: true });
  }

  switchBoardItemColumn(item: { id: number; boardColumnId: number }): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post<any>(`${this.apiUrl}/BoardItems/SwitchColumn`, item, { headers, withCredentials: true });
  }

  deleteBoardItem(itemId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/BoardItems/Delete/${itemId}`, { withCredentials: true });
  }

  updateItem(item: Item): Observable<Item> {
    return this.http.put<Item>(`${this.apiUrl}/BoardItems/Update`, item, { withCredentials: true });
  }

  deleteItem(itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/BoardItems/Delete/${itemId}`, { withCredentials: true });
  }

  closeSidebar(): void {
    // Logic to close sidebar
  }

  saveChanges(): void {
    // Logic to save the item changes
  }

  getTags(boardId: number): Observable<Tag[]> {
    return this.http.get<Tag[]>(
      `${this.apiUrl}/BoardItems/GetTags?boardId=${boardId}`,
      { withCredentials: true }
    );
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
}