import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BoardItemComponent } from './board-item.component';
import { BoardItemView } from '../../board-engine/models/board-item-view.model';

describe('BoardItemComponent', () => {
  let component: BoardItemComponent;
  let fixture: ComponentFixture<BoardItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardItemComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BoardItemComponent);
    component = fixture.componentInstance;
    // item is a required @Input() the template reads immediately (title, tags,
    // priorityId, fullName) — must be set before the first detectChanges().
    component.item = {
      raw: {} as any,
      id: 1,
      title: 'Test item',
      description: '',
      statusId: 1,
      priorityId: 0,
      boardId: 1,
      boardColumnId: 1,
      tags: [],
      fullName: '',
      initials: '',
      createdByFullName: '',
      modifiedByFullName: '',
    } as BoardItemView;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // "Your move": some of the item's asks wait on the viewer, as the board load says.
  const marker = () => (fixture.nativeElement as HTMLElement).querySelector('.your-move');
  const showWithYourMove = (yourMove: number | undefined) => {
    component.item = { ...component.item, askAttention: yourMove === undefined ? undefined : { yourMove } };
    fixture.detectChanges();
  };

  it('shows no marker when nothing waits on the viewer', () => {
    showWithYourMove(undefined);
    expect(marker()).toBeNull();
    showWithYourMove(0);
    expect(marker()).toBeNull();
  });

  const signal = () => marker()!.querySelector('.your-move-signal')!;
  const count = () => marker()!.querySelector('.your-move-count');

  it('says "Your move" on its banner, as a graphic screen readers skip for the sentence', () => {
    showWithYourMove(1);

    expect(signal().getAttribute('aria-hidden')).toBe('true');
    expect(signal().querySelector('.your-move-banner')!.textContent!.trim()).toBe('Your move');
    expect(signal().querySelectorAll('.your-move-stripe').length).toBe(2);
    expect(signal().querySelectorAll('.your-move-bar').length).toBe(3);
    expect(marker()!.querySelector('mat-icon')).toBeNull();
    expect(marker()!.querySelector('.visually-hidden')!.textContent!.trim()).toBe('Your move on 1 ask');
  });

  it('shows no count for a single ask', () => {
    showWithYourMove(1);
    expect(count()).toBeNull();
  });

  it('counts more than one in two digits, between the banner and the bars', () => {
    showWithYourMove(2);

    expect(count()!.textContent!.trim()).toBe('02');
    expect(count()!.previousElementSibling!.classList).toContain('your-move-banner');
    expect(count()!.nextElementSibling!.classList).toContain('your-move-bar');
    expect(marker()!.querySelector('.visually-hidden')!.textContent!.trim()).toBe('Your move on 2 asks');
  });

  it('keeps the count to two digits, then "99+" as the header tray does', () => {
    showWithYourMove(12);
    expect(count()!.textContent!.trim()).toBe('12');

    showWithYourMove(120);
    expect(count()!.textContent!.trim()).toBe('99+');
    expect(marker()!.querySelector('.visually-hidden')!.textContent!.trim()).toBe('Your move on 120 asks');
  });
});
