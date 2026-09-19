import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CommentService, CreateCommentRequest, UpdateCommentRequest } from './comment.service';
import { Comment, MentionableUser } from '../models/comment.model';
import { PagedResult } from '../models/activity-log.model';
import { environment } from '../../environments/environment';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    entityType: 'BoardItem',
    entityId: 88,
    parentCommentId: null,
    bodyHtml: '<p>hello</p>',
    isDeleted: false,
    authorUserId: 'user-1',
    authorFullName: 'Jane Doe',
    dateCreated: '2026-08-17T09:03:44.500Z',
    dateModified: null,
    isEdited: false,
    mentionedUserIds: [],
    ...overrides
  };
}

describe('CommentService', () => {
  let service: CommentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(CommentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getComments requests the correct URL with entityType, entityId, and paging params', () => {
    const expected: PagedResult<Comment> = {
      items: [makeComment()], totalCount: 1, pageNumber: 1, pageSize: 20, hasMore: false
    };

    service.getComments('BoardItem', 88, 1, 20).subscribe(result => {
      expect(result).toEqual(expected);
    });

    const req = httpMock.expectOne(
      r => r.url === `${environment.apiUrl}/Comments/BoardItem/88` &&
        r.params.get('pageNumber') === '1' &&
        r.params.get('pageSize') === '20'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush(expected);
  });

  it('getMentionableUsers requests the mentionable-users sub-route', () => {
    const expected: MentionableUser[] = [{ userId: 'user-2', fullName: 'Bob Smith' }];

    service.getMentionableUsers('CalendarEvent', 42).subscribe(result => {
      expect(result).toEqual(expected);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/Comments/CalendarEvent/42/mentionable-users`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush(expected);
  });

  it('createComment posts to the base Comments URL with the request body', () => {
    const request: CreateCommentRequest = {
      entityType: 'BoardItem', entityId: 88, parentCommentId: null,
      bodyHtml: '<p>hi</p>', mentionedUserIds: []
    };
    const expected = makeComment();

    service.createComment(request).subscribe(result => {
      expect(result).toEqual(expected);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/Comments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    expect(req.request.withCredentials).toBeTrue();
    req.flush(expected);
  });

  it('updateComment puts to the comment-specific URL with the request body', () => {
    const request: UpdateCommentRequest = { bodyHtml: '<p>edited</p>', mentionedUserIds: ['user-2'] };
    const expected = makeComment({ bodyHtml: '<p>edited</p>', isEdited: true });

    service.updateComment(1, request).subscribe(result => {
      expect(result).toEqual(expected);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/Comments/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    expect(req.request.withCredentials).toBeTrue();
    req.flush(expected);
  });

  it('deleteComment deletes at the comment-specific URL', () => {
    service.deleteComment(1).subscribe(result => {
      expect(result).toBeNull();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/Comments/1`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBeTrue();
    req.flush(null);
  });
});
