import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  const data: ConfirmDialogData = {
    title: 'Withdraw this ask?',
    message: 'Ayse Recipient won\'t be asked to help any more.',
    confirmLabel: 'Withdraw',
    destructive: true
  };
  let dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    dialogRef = TestBed.inject(MatDialog).open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data });
    TestBed.tick();
  });

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  const button = (selector: string) => document.querySelector<HTMLButtonElement>(`.mat-mdc-dialog-container ${selector}`)!;

  it('shows the question and the confirm label', () => {
    const container = document.querySelector('.mat-mdc-dialog-container')!;
    expect(container.textContent).toContain('Withdraw this ask?');
    expect(container.textContent).toContain('Ayse Recipient won\'t be asked to help any more.');
    expect(button('.confirm-ok').textContent!.trim()).toBe('Withdraw');
    expect(button('.confirm-ok').classList).toContain('destructive');
  });

  it('closes with true when confirmed', async () => {
    const closed = firstValueFrom(dialogRef.afterClosed());
    button('.confirm-ok').click();

    expect(await closed).toBeTrue();
  });

  it('closes with false on Cancel', async () => {
    const closed = firstValueFrom(dialogRef.afterClosed());
    button('.confirm-cancel').click();

    expect(await closed).toBeFalse();
  });
});
