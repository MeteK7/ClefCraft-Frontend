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
});
