import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ItemDetailSidebarComponent } from './item-detail-sidebar.component';

describe('ItemDetailSidebarComponent', () => {
  let component: ItemDetailSidebarComponent;
  let fixture: ComponentFixture<ItemDetailSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemDetailSidebarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ItemDetailSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
