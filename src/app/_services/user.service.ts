import { Observable } from "rxjs";
import { Assignee } from "../models/assignee.model";
import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class UserService {
  private apiUrl = 'https://localhost:7287/api/users';

  constructor(private http: HttpClient) {}

  getAssignees(): Observable<Assignee[]> {
    return this.http.get<Assignee[]>(this.apiUrl, {
      withCredentials: true
    });
  }
}
