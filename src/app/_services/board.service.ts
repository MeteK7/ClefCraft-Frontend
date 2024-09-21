import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Board, Column, Item } from '../models/board.model';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private apiUrl = 'https://localhost:7287/api'; // API base URL

  constructor(private http: HttpClient) {}

  getBoards(): Observable<Board[]> {
    return this.http.get<Board[]>(`${this.apiUrl}/Boards`);
  }

  getBoardColumns(): Observable<Column[]> {
    return this.http.get<Column[]>(`${this.apiUrl}/BoardItems`);
  }

  getBoardItems(): Observable<Item[]> {
    return this.http.get<Item[]>(`${this.apiUrl}/BoardItems`);
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
}