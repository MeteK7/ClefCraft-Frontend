import { TestBed, fakeAsync, flush } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { REASON_DIALOG_MESSAGE_ID, ReasonDialogComponent, ReasonDialogData } from './reason-dialog.component';

describe('ReasonDialogComponent', () => {
  const data: ReasonDialogData = {
    title: 'Decline this ask?',
    message: 'Rae Requester asked you:',
    quote: 'Review the migration',
    label: 'Why you\'re declining (optional)',
    hint: 'Everyone on this board will see this on the ask.',
    confirmLabel: 'Decline',
    maxLength: 500
  };
  let dialogRef: MatDialogRef<ReasonDialogComponent, string>;
  // 'open' until the dialog has closed: afterClosed emits once closing has finished.
  let result: string | undefined | 'open';

  function open(overrides: Partial<ReasonDialogData> = {}): void {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    // As the asks panel opens it.
    dialogRef = TestBed.inject(MatDialog).open<ReasonDialogComponent, ReasonDialogData, string>(ReasonDialogComponent, {
      data: { ...data, ...overrides }, disableClose: true, ariaDescribedBy: REASON_DIALOG_MESSAGE_ID
    });
    result = 'open';
    dialogRef.afterClosed().subscribe(r => result = r);
    flush();
  }

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  const container = () => document.querySelector<HTMLElement>('.mat-mdc-dialog-container')!;
  const field = () => container().querySelector<HTMLTextAreaElement>('textarea')!;
  const button = (selector: string) => container().querySelector<HTMLButtonElement>(selector)!;
  const text = (selector: string) => container().querySelector(selector)!.textContent!.replace(/\s+/g, ' ').trim();
  const type = (value: string) => {
    field().value = value;
    field().dispatchEvent(new Event('input'));
    TestBed.tick();
  };
  const keydown = (init: KeyboardEventInit) => field().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  const backdrop = () => document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!;

  it('says what is being declined, what the reason is for, and who will see it', fakeAsync(() => {
    open();

    expect(text('h2')).toBe('Decline this ask?');
    expect(text('.reason-message p')).toBe('Rae Requester asked you:');
    expect(text('.reason-quote')).toBe('“Review the migration”');
    expect(text('mat-label')).toBe('Why you\'re declining (optional)');
    expect(text('.reason-hint')).toBe('Everyone on this board will see this on the ask.');
    expect(text('.reason-confirm')).toBe('Decline');
  }));

  it('leaves out the quote line when there is nothing to quote', fakeAsync(() => {
    open({ quote: null });
    expect(container().querySelector('.reason-quote')).toBeNull();
  }));

  it('closes with the reason, trimmed', fakeAsync(() => {
    open();
    type('  Out this week  ');
    button('.reason-confirm').click();
    flush();
    expect(result).toBe('Out this week');
  }));

  it('closes with an empty reason when none was given', fakeAsync(() => {
    open();
    button('.reason-confirm').click();
    flush();
    expect(result).toBe('');
  }));

  it('cancels with Cancel, even with a reason typed', fakeAsync(() => {
    open();
    type('Out this week');
    button('.reason-cancel').click();
    flush();
    expect(result).toBeUndefined();
  }));

  it('cancels with Esc, even with a reason typed', fakeAsync(() => {
    open();
    type('Out this week');
    keydown({ key: 'Escape' });
    flush();
    expect(result).toBeUndefined();
  }));

  it('cancels on a backdrop click while nothing is typed', fakeAsync(() => {
    open();
    type('   ');
    backdrop().click();
    flush();
    expect(result).toBeUndefined();
  }));

  it('stays open on a backdrop click once something is typed, so the reason isn\'t lost', fakeAsync(() => {
    open();
    type('Out this week');
    backdrop().click();
    flush();
    expect(result).toBe('open');
    expect(field().value).toBe('Out this week');
  }));

  it('confirms with Ctrl+Enter; Enter alone adds a line', fakeAsync(() => {
    open();
    type('Out');
    keydown({ key: 'Enter' });
    flush();
    expect(result).toBe('open');

    keydown({ key: 'Enter', ctrlKey: true });
    flush();
    expect(result).toBe('Out');
  }));

  it('confirms with Cmd+Enter on a Mac', fakeAsync(() => {
    open();
    keydown({ key: 'Enter', metaKey: true });
    flush();
    expect(result).toBe('');
  }));

  it('limits the reason to the server\'s length and counts it', fakeAsync(() => {
    open();
    type('Out this week');

    expect(field().getAttribute('maxlength')).toBe('500');
    expect(text('.reason-count')).toBe('13 / 500');
  }));

  it('starts in the reason field', fakeAsync(() => {
    open();
    expect(document.activeElement).toBe(field());
  }));

  it('is labelled by its title and described by its message; the field by the hint and the count, quietly', fakeAsync(() => {
    open();

    expect(container().getAttribute('aria-labelledby')).toBe(container().querySelector('h2')!.id);
    expect(container().getAttribute('aria-describedby')).toBe(REASON_DIALOG_MESSAGE_ID);
    expect(document.getElementById(REASON_DIALOG_MESSAGE_ID)!.classList).toContain('reason-message');

    const describedBy = field().getAttribute('aria-describedby')!.split(' ');
    const hint = container().querySelector('.reason-hint')!;
    const count = container().querySelector('.reason-count')!;
    expect(hint.id).toBeTruthy();
    expect(count.id).toBeTruthy();
    expect(describedBy).toContain(hint.id);
    expect(describedBy).toContain(count.id);
    // mat-form-field's hint area is live; the count must not be in it, or any other live region.
    expect(count.closest('[aria-live]')).toBeNull();
    expect(hint.closest('[aria-live]')).toBeNull();
  }));

  it('confirms with the dismissive button, neither destructive nor primary', fakeAsync(() => {
    open();

    const confirm = button('.reason-confirm');
    expect(confirm.classList).toContain('dismissive');
    expect(confirm.classList).not.toContain('destructive');
    expect(confirm.classList).toContain('mat-mdc-outlined-button');
  }));
});
