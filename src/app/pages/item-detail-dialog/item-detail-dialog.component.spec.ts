import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { ItemDetailDialogComponent, ItemDetailDialogData } from './item-detail-dialog.component';
import { Item } from '../../models/board.model';
import { environment } from '../../../environments/environment';

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

describe('ItemDetailDialogComponent — markAsWorked()', () => {
  let component: ItemDetailDialogComponent;
  let fixture: ComponentFixture<ItemDetailDialogComponent>;
  let httpMock: HttpTestingController;
  let dialogRefSpy: { close: jasmine.Spy };

  const calendarApiUrl = `${environment.apiUrl}/Calendar`;

  const existingItem: Item = {
    id: 42,
    title: 'Practice scales',
    description: 'Daily warm-up',
    statusId: 1,
    priorityId: 1,
    boardId: 1,
    boardColumnId: 1,
  } as Item;

  function setup(item: Item | null): void {
    dialogRefSpy = { close: jasmine.createSpy('close') };

    TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { item, boardId: 1 } as ItemDetailDialogData },
        { provide: MatDialogRef, useValue: dialogRefSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ItemDetailDialogComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  it('does nothing when the item is new (unsaved) — needs a saved id to link to', () => {
    setup(null);

    component.markAsWorked();

    httpMock.expectNone(req => req.url === calendarApiUrl);
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('regression (6468b30): builds a true all-day event (local midnight to midnight+1), not a near-instant timed event', () => {
    setup(existingItem);
    // Drain the work-history fetch ngOnInit already triggered (the item has an id).
    httpMock.expectOne(`${calendarApiUrl}/work-history/42`).flush([]);

    component.markAsWorked();

    const req = httpMock.expectOne(r => r.url === calendarApiUrl && r.method === 'POST');
    const body = req.request.body;

    expect(body.allDayEvent).toBeTrue();
    expect(body.subject).toBe('Practice scales');
    expect(body.comment).toBe('Daily warm-up');
    expect(body.linkedBoardItemId).toBe(42);
    expect(body.importance).toBe(1);

    const start: Date = body.startDate;
    const end: Date = body.endDate;
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);

    req.flush({});
  });

  it('refetches work-history and closes the dialog once the event is saved', () => {
    setup(existingItem);
    httpMock.expectOne(`${calendarApiUrl}/work-history/42`).flush([]);

    component.markAsWorked();

    httpMock.expectOne(r => r.url === calendarApiUrl && r.method === 'POST').flush({});

    expect(dialogRefSpy.close).toHaveBeenCalled();
    httpMock.expectOne(`${calendarApiUrl}/work-history/42`).flush([]);
  });
});
