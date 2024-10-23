import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ItemDetailDialogComponent } from './item-detail-dialog.component';

describe('ItemDetailDialogComponent', () => {
  let component: ItemDetailDialogComponent;
  let fixture: ComponentFixture<ItemDetailDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ItemDetailDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
