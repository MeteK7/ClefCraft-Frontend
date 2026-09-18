import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { RecurrenceDeleteScopeDialogComponent } from './recurrence-delete-scope-dialog.component';

describe('RecurrenceDeleteScopeDialogComponent', () => {
  let component: RecurrenceDeleteScopeDialogComponent;
  let fixture: ComponentFixture<RecurrenceDeleteScopeDialogComponent>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<RecurrenceDeleteScopeDialogComponent>>;

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [RecurrenceDeleteScopeDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RecurrenceDeleteScopeDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to "this occurrence" scope', () => {
    expect(component.scope).toBe('this');
  });

  it('confirm() closes the dialog with the currently selected scope', () => {
    component.scope = 'thisAndFollowing';
    component.confirm();

    expect(dialogRefSpy.close).toHaveBeenCalledWith('thisAndFollowing');
  });

  it('confirm() with the "all" scope selected closes with "all"', () => {
    component.scope = 'all';
    component.confirm();

    expect(dialogRefSpy.close).toHaveBeenCalledWith('all');
  });

  it('cancel() closes the dialog with null, leaving nothing deleted', () => {
    component.cancel();

    expect(dialogRefSpy.close).toHaveBeenCalledWith(null);
  });
});
