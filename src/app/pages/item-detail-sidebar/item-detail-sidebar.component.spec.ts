import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ItemDetailSidebarComponent } from './item-detail-sidebar.component';
import { Item } from '../../models/board.model';
import { environment } from '../../../environments/environment';

describe('ItemDetailSidebarComponent', () => {
  let component: ItemDetailSidebarComponent;
  let fixture: ComponentFixture<ItemDetailSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemDetailSidebarComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()]
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

  // The sidebar edits only the title and description. Sending the whole item would resend its
  // status as the board last loaded it, and a stale Done would complete the item past its asks.
  it('saves only the fields it edits, never the item\'s status', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.item = { ...component.item, title: 'Renamed', description: 'More', statusId: 5 } as Item;

    component.onSave();

    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItems/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ id: 1, boardColumnId: 1, title: 'Renamed', description: 'More' });
    req.flush({ id: 1, title: 'Renamed', boardColumnId: 1 });
  });
});
