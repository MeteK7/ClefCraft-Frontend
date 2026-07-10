import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Board, BoardItemSearchResult, Column, CreateRelationshipRequest, Item, Priority, RelationshipHub, Status, Tag } from '../models/board.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private apiUrl = `${environment.apiUrl}`;

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

  getRelationships(itemId: number) {
    return this.http.get<RelationshipHub>(
      `${this.apiUrl}/BoardItemRelations/${itemId}`,
      { withCredentials: true });
  }

  searchRelationshipCandidates(
    boardId: number,
    itemId: number,
    search: string) {
    return this.http.get<BoardItemSearchResult[]>(
      `${this.apiUrl}/BoardItemRelations/search`,
      {
        params: {
          boardId,
          excludeItemId: itemId,
          searchTerm: search
        },
        withCredentials: true
      });
  }

  createRelationship(request: CreateRelationshipRequest) {
    return this.http.post(
      `${this.apiUrl}/BoardItemRelations`,
      request,
      { withCredentials: true });
  }

  deleteRelationship(relationId: number) {
    return this.http.delete(
      `${this.apiUrl}/BoardItemRelations/${relationId}`,
      { withCredentials: true });
  }
}