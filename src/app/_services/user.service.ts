import { Observable, map } from "rxjs";
import { Assignee } from "../models/assignee.model";
import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment";

interface BoardMember {
  userId: string;
  fullName: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Who can be assigned on this board: its members only (the API has no all-users directory). */
  getAssignees(boardId: number): Observable<Assignee[]> {
    return this.http
      .get<BoardMember[]>(`${this.apiUrl}/Boards/${boardId}/Members`, { withCredentials: true })
      .pipe(map(members => members.map(m => ({ id: m.userId, fullName: m.fullName }))));
  }
}
