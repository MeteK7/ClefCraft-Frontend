import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { ItemDetailDialogComponent, ItemDetailDialogData } from './item-detail-dialog.component';

describe('ItemDetailDialogComponent', () => {
  let component: ItemDetailDialogComponent;
  let fixture: ComponentFixture<ItemDetailDialogComponent>;

  const dialogData: ItemDetailDialogData = {
    item: null,
    boardId: 1
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: MatDialogRef, useValue: { close: () => { } } }
      ]
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
