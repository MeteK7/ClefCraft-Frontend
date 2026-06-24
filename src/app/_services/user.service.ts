import { Observable } from "rxjs";
import { Assignee } from "../models/assignee.model";
import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment";

@Injectable({ providedIn: 'root' })
export class UserService {
 private apiUrl = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  getAssignees(): Observable<Assignee[]> {
    return this.http.get<Assignee[]>(this.apiUrl, {
      withCredentials: true
    });
  }
}
