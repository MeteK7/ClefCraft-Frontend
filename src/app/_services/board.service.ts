import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Column, Item } from '../models/board.model';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private apiUrl = 'https://localhost:7287/api/BoardItems'; // API base URL

  constructor(private http: HttpClient) {}

  getBoardColumns(): Observable<Column[]> {
    return this.http.get<Column[]>(this.apiUrl);
  }
  
  getBoardItems(): Observable<Item[]> {
    return this.http.get<Item[]>(this.apiUrl);
  }

  createBoardItem(item: Partial<Item>): Observable<Item> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post<Item>(this.apiUrl, item, { headers });
  }
}