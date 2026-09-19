import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Comment, MentionableUser } from '../models/comment.model';
import { PagedResult } from '../models/activity-log.model';
import { environment } from '../../environments/environment';

export interface CreateCommentRequest {
  entityType: string;
  entityId: number;
  parentCommentId?: number | null;
  bodyHtml: string;
  mentionedUserIds: string[];
}

export interface UpdateCommentRequest {
  bodyHtml: string;
  mentionedUserIds: string[];
}

@Injectable({
  providedIn: 'root',
})
export class CommentService {
  private apiUrl = `${environment.apiUrl}/Comments`;

  constructor(private http: HttpClient) { }

  getComments(entityType: string, entityId: number, pageNumber = 1, pageSize = 20): Observable<PagedResult<Comment>> {
    const params = new HttpParams()
      .set('pageNumber', pageNumber)
      .set('pageSize', pageSize);

    return this.http.get<PagedResult<Comment>>(
      `${this.apiUrl}/${entityType}/${entityId}`,
      { params, withCredentials: true }
    );
  }

  getMentionableUsers(entityType: string, entityId: number): Observable<MentionableUser[]> {
    return this.http.get<MentionableUser[]>(
      `${this.apiUrl}/${entityType}/${entityId}/mentionable-users`,
      { withCredentials: true }
    );
  }

  createComment(request: CreateCommentRequest): Observable<Comment> {
    return this.http.post<Comment>(this.apiUrl, request, { withCredentials: true });
  }

  updateComment(id: number, request: UpdateCommentRequest): Observable<Comment> {
    return this.http.put<Comment>(`${this.apiUrl}/${id}`, request, { withCredentials: true });
  }

  deleteComment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`, { withCredentials: true });
  }
}
