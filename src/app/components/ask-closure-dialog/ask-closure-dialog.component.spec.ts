import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { AskClosureDialogComponent, AskClosureDialogData } from './ask-closure-dialog.component';
import { AskAction, AskCancelReason, AskState } from '../../models/board-item-ask.model';
import { makeAsk } from '../../models/board-item-ask.testing';

describe('AskClosureDialogComponent', () => {
  let component: AskClosureDialogComponent;
  let fixture: ComponentFixture<AskClosureDialogComponent>;
  let dialogRef: { close: jasmine.Spy };

  const pending = makeAsk({ id: 1, state: AskState.Pending, revision: 2 });
  const acceptedRequired = makeAsk({
    id: 2, state: AskState.Accepted, isRequired: true, revision: 5,
    recipientFullName: 'Kemal Reviewer', allowedActions: [AskAction.CompleteOnBehalf]
  });
  const acceptedNotMine = makeAsk({ id: 3, state: AskState.Accepted, revision: 1, allowedActions: [] });
  const removedRequired = makeAsk({
    id: 4, state: AskState.Cancelled, isRequired: true, cancelReason: AskCancelReason.RecipientRemoved, revision: 3
  });

  function setup(data: AskClosureDialogData): void {
    dialogRef = { close: jasmine.createSpy('close') };
    TestBed.configureTestingModule({
      imports: [AskClosureDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef }
      ]
    });
    fixture = TestBed.createComponent(AskClosureDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const asks = [pending, acceptedRequired, acceptedNotMine, removedRequired];

  it('preselects "Close it" for every Accepted ask, so nobody is credited by accident', () => {
    setup({ itemTitle: 'Release notes', asks });

    expect(component.isMarkedDone(acceptedRequired)).toBeFalse();
    expect(component.closure.completeAskIds).toEqual([]);
  });

  it('offers "Mark it done" only where the API allows it', () => {
    setup({ itemTitle: 'Release notes', asks });

    expect(component.canMarkDone(acceptedRequired)).toBeTrue();
    expect(component.canMarkDone(acceptedNotMine)).toBeFalse();
    expect(component.canMarkDone(pending)).toBeFalse();

    component.setMarkDone(acceptedNotMine, true);
    expect(component.closure.completeAskIds).toEqual([]);
  });

  it('derives the override list from the choices: marking a required Accepted ask done removes it', () => {
    setup({ itemTitle: 'Release notes', asks });

    expect(component.closure.overrideAskIds).toEqual([2, 4]);

    component.setMarkDone(acceptedRequired, true);

    expect(component.closure.completeAskIds).toEqual([2]);
    expect(component.closure.overrideAskIds).toEqual([4]);
  });

  it('needs the override confirmed, and asks again when the choices change the list', () => {
    setup({ itemTitle: 'Release notes', asks });

    component.complete();
    expect(dialogRef.close).not.toHaveBeenCalled();

    component.setOverrideConfirmed(true);
    expect(component.overrideConfirmed).toBeTrue();

    component.setMarkDone(acceptedRequired, true); // the list changed: [4]
    expect(component.overrideConfirmed).toBeFalse();

    component.setOverrideConfirmed(true);
    component.complete();

    expect(dialogRef.close).toHaveBeenCalledOnceWith({
      acknowledgedAsks: [
        { askId: 1, revision: 2 }, { askId: 2, revision: 5 }, { askId: 3, revision: 1 }, { askId: 4, revision: 3 }
      ],
      completeAskIds: [2],
      overrideAskIds: [4]
    });
  });

  it('needs no confirmation when nothing is required', () => {
    setup({ itemTitle: 'Release notes', asks: [pending] });

    expect(component.overriddenAsks).toEqual([]);
    component.complete();

    expect(dialogRef.close).toHaveBeenCalledOnceWith({
      acknowledgedAsks: [{ askId: 1, revision: 2 }], completeAskIds: [], overrideAskIds: []
    });
  });

  it('shows why a terminal requirement is unmet, and the reopen notice', () => {
    setup({ itemTitle: 'Release notes', asks, notice: 'The item\'s asks changed; review them again.' });
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(text).toContain('Required, but the recipient left the board.');
    expect(text).toContain('Not accepted yet: it will be closed.');
    expect(text).toContain('The item\'s asks changed; review them again.');
  });

  it('cancelling closes without a closure', () => {
    setup({ itemTitle: 'Release notes', asks });

    component.cancel();

    expect(dialogRef.close).toHaveBeenCalledOnceWith();
  });
});
