import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { ItemDetailSidebarComponent } from './item-detail-sidebar.component';
import { Item } from '../../models/board.model';

describe('ItemDetailSidebarComponent', () => {
  let component: ItemDetailSidebarComponent;
  let fixture: ComponentFixture<ItemDetailSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemDetailSidebarComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ItemDetailSidebarComponent);
    component = fixture.componentInstance;
    // item is a required @Input() the template binds to immediately (title,
    // description, etc. via ngModel) — must be set before the first detectChanges().
    component.item = {
      id: 1, title: 'Test item', description: '',
      statusId: 1, priorityId: 1, boardId: 1, boardColumnId: 1,
    } as Item;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
