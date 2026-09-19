import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CommentComposerComponent } from './comment-composer.component';
import { CommentService } from '../../_services/comment.service';
import { MentionableUser } from '../../models/comment.model';

describe('CommentComposerComponent', () => {
  let fixture: ComponentFixture<CommentComposerComponent>;
  let component: CommentComposerComponent;
  let commentServiceSpy: jasmine.SpyObj<CommentService>;

  beforeEach(async () => {
    commentServiceSpy = jasmine.createSpyObj('CommentService', ['getMentionableUsers']);
    commentServiceSpy.getMentionableUsers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CommentComposerComponent],
      providers: [{ provide: CommentService, useValue: commentServiceSpy }]
    }).compileComponents();

    fixture = TestBed.createComponent(CommentComposerComponent);
    component = fixture.componentInstance;
    component.entityType = 'BoardItem';
    component.entityId = 88;
  });

  it('loads mentionable users on init', () => {
    const users: MentionableUser[] = [{ userId: 'user-2', fullName: 'Bob Smith' }];
    commentServiceSpy.getMentionableUsers.and.returnValue(of(users));

    fixture.detectChanges();

    expect(commentServiceSpy.getMentionableUsers).toHaveBeenCalledWith('BoardItem', 88);
    expect(component.mentionableUsers).toEqual(users);
  });

  describe('hasContent / isCollapsed', () => {
    it('is false/collapsed for empty content', () => {
      component.collapsible = true;
      fixture.detectChanges();

      expect(component.hasContent).toBeFalse();
      expect(component.isCollapsed).toBeTrue();
    });

    it('is false for content that is only whitespace/&nbsp; once tags are stripped', () => {
      fixture.detectChanges();
      component.bodyControl.setValue('<p>&nbsp;&nbsp;</p>');

      expect(component.hasContent).toBeFalse();
    });

    it('is true/not-collapsed once real content is present', () => {
      component.collapsible = true;
      fixture.detectChanges();
      component.bodyControl.setValue('<p>hello</p>');

      expect(component.hasContent).toBeTrue();
      expect(component.isCollapsed).toBeFalse();
    });

    it('is never collapsed when collapsible is false, regardless of expanded/content', () => {
      component.collapsible = false;
      fixture.detectChanges();

      expect(component.isCollapsed).toBeFalse();
    });
  });

  it('regression (8dc7163): mention dropdown uses fixed positioning', () => {
    fixture.detectChanges();
    expect(component.quillModules.mention.positioningStrategy).toBe('fixed');
  });

  describe('onSubmit', () => {
    it('does not emit and leaves the form untouched when there is no content', () => {
      fixture.detectChanges();
      let emitted = false;
      component.submitted.subscribe(() => emitted = true);

      component.onSubmit();

      expect(emitted).toBeFalse();
    });

    it('emits the body and extracted, deduped mentions, then resets and collapses', () => {
      fixture.detectChanges();
      component.expanded = true;
      component.bodyControl.setValue(
        '<p>Hi <span class="mention" data-id="user-2" data-value="Bob Smith">@Bob Smith</span>, ' +
        'loop in <span class="mention" data-id="user-2" data-value="Bob Smith">@Bob Smith</span> and ' +
        '<span class="mention" data-id="user-3" data-value="Ann Lee">@Ann Lee</span></p>'
      );

      let emitted: { bodyHtml: string; mentionedUserIds: string[]; mentionedUsers: { userId: string; fullName: string }[] } | undefined;
      component.submitted.subscribe(payload => emitted = payload);

      component.onSubmit();

      expect(emitted?.mentionedUserIds).toEqual(['user-2', 'user-3']);
      expect(emitted?.mentionedUsers).toEqual([
        { userId: 'user-2', fullName: 'Bob Smith' },
        { userId: 'user-3', fullName: 'Ann Lee' }
      ]);
      expect(emitted?.bodyHtml).toContain('Bob Smith');
      expect(component.bodyControl.value).toBe('');
      expect(component.expanded).toBeFalse();
    });
  });

  describe('onCancel — regression (2f49d9c)', () => {
    it('emits immediately with no confirmation when there is no content', () => {
      fixture.detectChanges();
      spyOn(window, 'confirm');
      let cancelled = false;
      component.cancelled.subscribe(() => cancelled = true);

      component.onCancel();

      expect(window.confirm).not.toHaveBeenCalled();
      expect(cancelled).toBeTrue();
    });

    it('does not emit when there is content and the user declines the discard confirmation', () => {
      fixture.detectChanges();
      component.bodyControl.setValue('<p>a draft</p>');
      spyOn(window, 'confirm').and.returnValue(false);
      let cancelled = false;
      component.cancelled.subscribe(() => cancelled = true);

      component.onCancel();

      expect(window.confirm).toHaveBeenCalledWith('Discard this draft?');
      expect(cancelled).toBeFalse();
      expect(component.bodyControl.value).toBe('<p>a draft</p>');
    });

    it('emits and resets the form when there is content and the user confirms the discard', () => {
      fixture.detectChanges();
      component.expanded = true;
      component.bodyControl.setValue('<p>a draft</p>');
      spyOn(window, 'confirm').and.returnValue(true);
      let cancelled = false;
      component.cancelled.subscribe(() => cancelled = true);

      component.onCancel();

      expect(cancelled).toBeTrue();
      expect(component.bodyControl.value).toBe('');
      expect(component.expanded).toBeFalse();
    });
  });

  describe('onComposerClick — regression (ce756e4)', () => {
    it('expands a collapsed composer', () => {
      component.collapsible = true;
      fixture.detectChanges();
      expect(component.isCollapsed).toBeTrue();

      component.onComposerClick();

      expect(component.expanded).toBeTrue();
    });

    it('is a no-op when the composer is not collapsed', () => {
      component.collapsible = false;
      fixture.detectChanges();
      expect(component.isCollapsed).toBeFalse();

      component.onComposerClick();

      expect(component.expanded).toBeFalse();
    });
  });
});
