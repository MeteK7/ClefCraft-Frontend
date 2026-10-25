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

  it('says "Your move" in words and an icon, with how many asks for screen readers', () => {
    showWithYourMove(1);

    expect(marker()!.querySelector('mat-icon')!.getAttribute('aria-hidden')).toBe('true');
    expect(marker()!.querySelector('[aria-hidden="true"]:not(mat-icon)')!.textContent!.trim()).toBe('Your move');
    expect(marker()!.querySelector('.visually-hidden')!.textContent!.trim()).toBe('Your move on 1 ask');
  });

  it('counts more than one', () => {
    showWithYourMove(2);

    expect(marker()!.querySelector('[aria-hidden="true"]:not(mat-icon)')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Your move · 2');
    expect(marker()!.querySelector('.visually-hidden')!.textContent!.trim()).toBe('Your move on 2 asks');
  });
});
