import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Board, Column, Item } from '../models/board.model';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private apiUrl = 'https://localhost:7287/api'; // API base URL

  constructor(private http: HttpClient) { }

  getBoards(): Observable<Board[]> {
    return this.http.get<Board[]>(`${this.apiUrl}/Boards`);
  }

  getBoardItemsByBoardId(boardId: number): Observable<Column[]> {
    return this.http.get<Column[]>(`${this.apiUrl}/BoardItems/GetBoardItemsByBoardId/${boardId}`);
  }

  createBoardItem(item: Partial<Item>): Observable<Item> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post<Item>(`${this.apiUrl}/BoardItems/Create`, item, { headers });
  }

  updateBoardItemColumn(item: { id: number; boardColumnId: number }): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post<any>(`${this.apiUrl}/BoardItems/SwitchColumn`, item, { headers });
  }

  // Fetch item details
  getBoardItemById(itemId: number): Observable<Item> {
    return this.http.get<Item>(`${this.apiUrl}/BoardItems/${itemId}`);
  }

  // Update an item
  updateBoardItem(item: Item): Observable<Item> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.put<Item>(`${this.apiUrl}/BoardItems/Update/${item.id}`, item, { headers });
  }

  // Delete an item
  deleteBoardItem(itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/BoardItems/Delete/${itemId}`);
  }
}