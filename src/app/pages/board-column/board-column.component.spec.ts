import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { BoardColumnComponent } from './board-column.component';
import { BoardColumnView } from '../../board-engine/models/board-column-view.model';

describe('BoardColumnComponent', () => {
  let component: BoardColumnComponent;
  let fixture: ComponentFixture<BoardColumnComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardColumnComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BoardColumnComponent);
    component = fixture.componentInstance;
    // column/allColumnIds are required @Input()s the template binds to
    // immediately (title, cdkDropList id/data) — must be set before detectChanges().
    component.column = { id: 1, title: 'To Do', dropListId: 'column-To Do', boardItems: [] } as BoardColumnView;
    component.allColumnIds = [];
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
