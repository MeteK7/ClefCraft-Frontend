import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

import { LiveReminderToastComponent } from './live-reminder-toast.component';

describe('LiveReminderToastComponent', () => {
  let fixture: ComponentFixture<LiveReminderToastComponent>;
  let snackBarRef: jasmine.SpyObj<MatSnackBarRef<LiveReminderToastComponent>>;

  const DURATION = 12000;

  function toast(): HTMLElement {
    return fixture.nativeElement.querySelector('.reminder-toast');
  }

  function hover(): void {
    toast().dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
  }

  function unhover(): void {
    toast().dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    snackBarRef = jasmine.createSpyObj('MatSnackBarRef', ['dismiss', 'dismissWithAction']);

    await TestBed.configureTestingModule({
      imports: [LiveReminderToastComponent],
      providers: [
        { provide: MatSnackBarRef, useValue: snackBarRef },
        { provide: MAT_SNACK_BAR_DATA, useValue: { message: 'Lesson starts in 10 minutes', eventId: 62 } },
      ],
    }).compileComponents();
  });

  function createToast(): void {
    fixture = TestBed.createComponent(LiveReminderToastComponent);
    fixture.detectChanges();
  }

  it('dismisses itself after its duration when not hovered', fakeAsync(() => {
    createToast();

    tick(DURATION - 1);
    expect(snackBarRef.dismiss).not.toHaveBeenCalled();

    tick(1);
    expect(snackBarRef.dismiss).toHaveBeenCalledTimes(1);
  }));

  it('does not dismiss while the pointer is over it', fakeAsync(() => {
    createToast();

    tick(5000);
    hover();
    tick(DURATION * 3);

    expect(snackBarRef.dismiss).not.toHaveBeenCalled();
    fixture.destroy();
    flush();
  }));

  it('pauses the progress bar while hovered', fakeAsync(() => {
    createToast();

    hover();
    expect(toast().classList).toContain('reminder-toast--paused');

    unhover();
    expect(toast().classList).not.toContain('reminder-toast--paused');
    fixture.destroy();
    flush();
  }));

  it('resumes with the remaining time, not the full duration, when the pointer leaves', fakeAsync(() => {
    createToast();

    tick(5000);
    hover();
    tick(3000);
    unhover();

    tick(DURATION - 5000 - 1);
    expect(snackBarRef.dismiss).not.toHaveBeenCalled();

    tick(1);
    expect(snackBarRef.dismiss).toHaveBeenCalledTimes(1);
  }));

  it('keeps the remaining time across repeated hovers', fakeAsync(() => {
    createToast();

    tick(4000);
    hover();
    tick(10000);
    unhover();
    tick(4000);
    hover();
    tick(10000);
    unhover();

    tick(4000 - 1);
    expect(snackBarRef.dismiss).not.toHaveBeenCalled();

    tick(1);
    expect(snackBarRef.dismiss).toHaveBeenCalledTimes(1);
  }));

  it('does not dismiss after it has been destroyed', fakeAsync(() => {
    createToast();

    fixture.destroy();
    tick(DURATION);

    expect(snackBarRef.dismiss).not.toHaveBeenCalled();
    flush();
  }));
});
