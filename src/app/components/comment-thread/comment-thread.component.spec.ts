import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { CommentThreadComponent } from './comment-thread.component';
import { CommentService } from '../../_services/comment.service';
import { AuthService } from '../../_services/auth.service';
import { Comment } from '../../models/comment.model';
import { PagedResult } from '../../models/activity-log.model';

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

function pagedResult(items: Comment[], hasMore = false): PagedResult<Comment> {
  return { items, totalCount: items.length, pageNumber: 1, pageSize: 20, hasMore };
}

describe('CommentThreadComponent', () => {
  let fixture: ComponentFixture<CommentThreadComponent>;
  let component: CommentThreadComponent;
  let commentServiceSpy: jasmine.SpyObj<CommentService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    commentServiceSpy = jasmine.createSpyObj('CommentService', [
      'getComments', 'createComment', 'updateComment', 'deleteComment', 'getMentionableUsers'
    ]);
    commentServiceSpy.getComments.and.returnValue(of(pagedResult([])));
    commentServiceSpy.getMentionableUsers.and.returnValue(of([]));

    authServiceSpy = jasmine.createSpyObj('AuthService', ['getUserId', 'getCurrentUser']);
    authServiceSpy.getUserId.and.returnValue('user-1');
    authServiceSpy.getCurrentUser.and.returnValue({ fullName: 'Jane Doe' } as any);

    await TestBed.configureTestingModule({
      imports: [CommentThreadComponent],
      providers: [
        { provide: CommentService, useValue: commentServiceSpy },
        { provide: AuthService, useValue: authServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CommentThreadComponent);
    component = fixture.componentInstance;
    component.entityType = 'BoardItem';
    component.entityId = 88;
  });

  it('loads comments on init', () => {
    const first = makeComment({ id: 1 });
    commentServiceSpy.getComments.and.returnValue(of(pagedResult([first], true)));

    fixture.detectChanges();

    expect(component.comments).toEqual([first]);
    expect(component.hasMore).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('shows loading while the request is pending', () => {
    let sawLoading = false;
    commentServiceSpy.getComments.and.callFake(() => {
      sawLoading = component.loading;
      return of(pagedResult([]));
    });

    fixture.detectChanges();

    expect(sawLoading).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('sets error state when the request fails', () => {
    commentServiceSpy.getComments.and.returnValue(throwError(() => new Error('network')));

    fixture.detectChanges();

    expect(component.error).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('loadMore requests the next page and appends rather than replaces', () => {
    const first = makeComment({ id: 1 });
    const second = makeComment({ id: 2 });
    commentServiceSpy.getComments.and.returnValue(of(pagedResult([first], true)));
    fixture.detectChanges();
    expect(component.comments.length).toBe(1);

    commentServiceSpy.getComments.and.returnValue(of(pagedResult([second], false)));
    component.loadMore();

    expect(commentServiceSpy.getComments).toHaveBeenCalledWith('BoardItem', 88, 2, 20);
    expect(component.comments).toEqual([first, second]);
  });

  it('retry resets to page 1 and reloads', () => {
    commentServiceSpy.getComments.and.returnValue(of(pagedResult([], true)));
    fixture.detectChanges();
    component.loadMore(); // now on page 2

    commentServiceSpy.getComments.and.returnValue(of(pagedResult([makeComment()], false)));
    component.retry();

    expect(commentServiceSpy.getComments).toHaveBeenCalledWith('BoardItem', 88, 1, 20);
  });

  it('separates top-level comments from replies', () => {
    const top = makeComment({ id: 1, parentCommentId: null });
    const reply = makeComment({ id: 2, parentCommentId: 1 });
    commentServiceSpy.getComments.and.returnValue(of(pagedResult([top, reply])));
    fixture.detectChanges();

    expect(component.topLevelComments).toEqual([top]);
    expect(component.repliesFor(1)).toEqual([reply]);
  });

  describe('deleteComment', () => {
    it('does not call the API when the user declines the confirmation', () => {
      const comment = makeComment();
      spyOn(window, 'confirm').and.returnValue(false);

      component.deleteComment(comment);

      expect(window.confirm).toHaveBeenCalledWith('Delete this comment?');
      expect(commentServiceSpy.deleteComment).not.toHaveBeenCalled();
      expect(comment.isDeleted).toBeFalse();
    });

    it('soft-deletes in place (does not remove from the array) when confirmed', () => {
      const comment = makeComment({ id: 1, bodyHtml: '<p>hello</p>', mentionedUserIds: ['user-2'] });
      commentServiceSpy.getComments.and.returnValue(of(pagedResult([comment])));
      fixture.detectChanges();
      spyOn(window, 'confirm').and.returnValue(true);
      commentServiceSpy.deleteComment.and.returnValue(of(undefined as unknown as void));

      component.deleteComment(comment);

      expect(commentServiceSpy.deleteComment).toHaveBeenCalledWith(1);
      expect(comment.isDeleted).toBeTrue();
      expect(comment.bodyHtml).toBeNull();
      expect(comment.mentionedUserIds).toEqual([]);
      expect(component.comments).toEqual([comment]); // still present, just tombstoned
    });
  });

  describe('confirmNewCalendarShares (via submitTopLevel)', () => {
    const payload = {
      bodyHtml: '<p>@Bob check this out</p>',
      mentionedUserIds: ['user-2'],
      mentionedUsers: [{ userId: 'user-2', fullName: 'Bob Smith' }]
    };

    beforeEach(() => {
      commentServiceSpy.createComment.and.returnValue(of(makeComment({ id: 99 })));
    });

    it('BoardItem: never prompts and posts normally', () => {
      component.entityType = 'BoardItem';
      fixture.detectChanges();
      spyOn(window, 'confirm');
      let granted: string[] | undefined;
      component.calendarCollaboratorsGranted.subscribe(ids => granted = ids);

      component.submitTopLevel(payload);

      expect(window.confirm).not.toHaveBeenCalled();
      expect(commentServiceSpy.createComment).toHaveBeenCalled();
      expect(granted).toBeUndefined();
    });

    it('CalendarEvent, caller is not the owner: never prompts and posts normally', () => {
      component.entityType = 'CalendarEvent';
      component.calendarEventOwnerUserId = 'owner-1'; // not 'user-1'
      fixture.detectChanges();
      spyOn(window, 'confirm');
      let granted: string[] | undefined;
      component.calendarCollaboratorsGranted.subscribe(ids => granted = ids);

      component.submitTopLevel(payload);

      expect(window.confirm).not.toHaveBeenCalled();
      expect(commentServiceSpy.createComment).toHaveBeenCalled();
      expect(granted).toBeUndefined();
    });

    it('CalendarEvent, caller is owner, mentions an existing collaborator: no prompt', () => {
      component.entityType = 'CalendarEvent';
      component.calendarEventOwnerUserId = 'user-1';
      component.calendarCollaboratorUserIds = ['user-2'];
      fixture.detectChanges();
      spyOn(window, 'confirm');

      component.submitTopLevel(payload);

      expect(window.confirm).not.toHaveBeenCalled();
      expect(commentServiceSpy.createComment).toHaveBeenCalled();
    });

    it('CalendarEvent, caller is owner, mentions someone new, declines the share: does not post', () => {
      component.entityType = 'CalendarEvent';
      component.calendarEventOwnerUserId = 'user-1';
      component.calendarCollaboratorUserIds = [];
      fixture.detectChanges();
      spyOn(window, 'confirm').and.returnValue(false);

      component.submitTopLevel(payload);

      expect(window.confirm).toHaveBeenCalled();
      expect(commentServiceSpy.createComment).not.toHaveBeenCalled();
    });

    it('CalendarEvent, caller is owner, mentions someone new, confirms: posts and emits the grant only after success', () => {
      component.entityType = 'CalendarEvent';
      component.calendarEventOwnerUserId = 'user-1';
      component.calendarCollaboratorUserIds = [];
      fixture.detectChanges();
      spyOn(window, 'confirm').and.returnValue(true);
      let granted: string[] | undefined;
      component.calendarCollaboratorsGranted.subscribe(ids => granted = ids);

      component.submitTopLevel(payload);

      expect(window.confirm).toHaveBeenCalled();
      expect(commentServiceSpy.createComment).toHaveBeenCalled();
      expect(granted).toEqual(['user-2']);
    });
  });
});
