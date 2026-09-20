import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { BoardDialogComponent } from './board-dialog.component';

describe('BoardDialogComponent', () => {
  let component: BoardDialogComponent;
  let fixture: ComponentFixture<BoardDialogComponent>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<BoardDialogComponent>>;

  async function createDialog(data: { board: any }): Promise<void> {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [BoardDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BoardDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await createDialog({ board: null });
    expect(component).toBeTruthy();
  });

  it('handleSave() with a blank title does not close the dialog and marks the form touched', async () => {
    await createDialog({ board: null });

    component.form.get('title')?.setValue('   ');
    component.handleSave();

    expect(dialogRefSpy.close).not.toHaveBeenCalled();
    expect(component.form.get('title')?.touched).toBeTrue();
  });

  it('handleSave() with a valid title closes the dialog with the trimmed title', async () => {
    await createDialog({ board: null });

    component.form.get('title')?.setValue('  My New Board  ');
    component.handleSave();

    expect(dialogRefSpy.close).toHaveBeenCalledWith({ title: 'My New Board' });
  });

  it('handleCancel() closes the dialog with null', async () => {
    await createDialog({ board: null });

    component.handleCancel();

    expect(dialogRefSpy.close).toHaveBeenCalledWith(null);
  });

  it('isEdit is false when data.board is null', async () => {
    await createDialog({ board: null });
    expect(component.isEdit).toBeFalse();
  });
});
