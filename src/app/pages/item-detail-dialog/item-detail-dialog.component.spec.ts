import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient, withXhr } from '@angular/common/http';
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
        provideHttpClient(withXhr()),
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
        provideHttpClient(withXhr()),
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

describe('ItemDetailDialogComponent — assignee options', () => {
  let component: ItemDetailDialogComponent;
  let httpMock: HttpTestingController;

  const membersUrl = `${environment.apiUrl}/Boards/7/Members`;

  function setup(item: Item | null): void {
    TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { item, boardId: 7 } as ItemDetailDialogData },
        { provide: MatDialogRef, useValue: { close: () => { } } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ItemDetailDialogComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  const members = [
    { id: 1, boardId: 7, userId: 'member-1', fullName: 'Member One' },
    { id: 2, boardId: 7, userId: 'member-2', fullName: 'Member Two' }
  ];

  it("offers only the board's members, fetched for this item's board", () => {
    setup(null);

    httpMock.expectOne(membersUrl).flush(members);

    expect(component.assignees).toEqual([
      { id: 'member-1', fullName: 'Member One' },
      { id: 'member-2', fullName: 'Member Two' }
    ]);
    httpMock.expectNone(req => req.url.endsWith('/users'));
  });

  it('keeps a current assignee who has left the board selectable, labelled as such', () => {
    setup({
      id: 5, title: 'Etude', boardId: 7, boardColumnId: 1,
      assigneeId: 'former', assigneeFirstName: 'Old', assigneeLastName: 'Timer'
    } as Item);

    httpMock.expectOne(membersUrl).flush(members);

    expect(component.assignees).toContain({ id: 'former', fullName: 'Old Timer (not a board member)' });
    expect(component.form.value.assigneeId).toBe('former');
  });

  it('adds nothing extra when the current assignee is a member', () => {
    setup({ id: 5, title: 'Etude', boardId: 7, boardColumnId: 1, assigneeId: 'member-2' } as Item);

    httpMock.expectOne(membersUrl).flush(members);

    expect(component.assignees.length).toBe(2);
  });
});

describe('ItemDetailDialogComponent — current status and priority', () => {
  let component: ItemDetailDialogComponent;
  let httpMock: HttpTestingController;

  const statusesUrl = `${environment.apiUrl}/BoardItems/GetStatuses?boardId=7`;
  const prioritiesUrl = `${environment.apiUrl}/BoardItems/GetPriorities?boardId=7`;

  const statuses = [
    { id: 1, name: 'Backlog' }, { id: 2, name: 'To Do' }, { id: 3, name: 'In Progress' },
    { id: 4, name: 'In Review' }, { id: 5, name: 'Done' }
  ];
  const priorities = [{ id: 1, name: 'Critical' }, { id: 2, name: 'High' }, { id: 3, name: 'Medium' }, { id: 4, name: 'Low' }];

  function setup(item: Item | null): void {
    TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { item, boardId: 7 } as ItemDetailDialogData },
        { provide: MatDialogRef, useValue: { close: () => { } } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ItemDetailDialogComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(statusesUrl).flush(statuses);
    httpMock.expectOne(prioritiesUrl).flush(priorities);
  }

  // The board passes the item as the API returns it: status and priority as nested objects,
  // without statusId/priorityId (BoardItemDto has none). Falling back to the first option here
  // would show, and on Save write, Backlog/Critical for every item.
  it('shows the status and priority the item has, as returned by the API', () => {
    setup({
      id: 5, title: 'Review the API', boardId: 7, boardColumnId: 3,
      status: { id: 3, name: 'In Progress' }, priority: { id: 3, name: 'Medium' }
    } as Item);

    expect(component.form.value.statusId).toBe(3);
    expect(component.form.value.priorityId).toBe(3);
  });

  it('still uses statusId/priorityId when an item carries them', () => {
    setup({ id: 5, title: 'Etude', boardId: 7, boardColumnId: 3, statusId: 4, priorityId: 2 } as Item);

    expect(component.form.value.statusId).toBe(4);
    expect(component.form.value.priorityId).toBe(2);
  });

  it('defaults a new item to the first status and priority', () => {
    setup(null);

    expect(component.form.value.statusId).toBe(1);
    expect(component.form.value.priorityId).toBe(1);
  });
});

describe('ItemDetailDialogComponent — header', () => {
  let component: ItemDetailDialogComponent;
  let fixture: ComponentFixture<ItemDetailDialogComponent>;

  const longTitle = 'Write on-call runbook for LLM provider outages and the escalation paths that follow them';

  function setup(item: Item | null): void {
    TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { item, boardId: 1 } as ItemDetailDialogData },
        { provide: MatDialogRef, useValue: { close: () => { } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ItemDetailDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const header = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.dialog-header')!;
  const heading = () => header().querySelector<HTMLElement>('h2.dialog-title')!;
  /** Text as assistive tech reads it: runs of whitespace collapse to one space. */
  const headingText = () => heading().textContent!.replace(/\s+/g, ' ').trim();

  it('shows the id and the title side by side', () => {
    setup({ id: 78, title: longTitle, boardId: 1, boardColumnId: 1 } as Item);

    expect(header().querySelector('.item-id-badge')!.textContent).toContain('#78');
    expect(headingText()).toBe(`Item #78: ${longTitle}`);
    expect(heading().classList).not.toContain('placeholder');
  });

  it('follows unsaved edits to the title field live', () => {
    setup({ id: 78, title: 'Old title', boardId: 1, boardColumnId: 1 } as Item);

    component.form.controls['title'].setValue('  Renamed, not saved yet ');
    fixture.detectChanges();

    expect(heading().textContent).toContain('Renamed, not saved yet');
    expect(heading().textContent).not.toContain('Old title');
  });

  it('shows "New item" for a new item, with no id badge and no "#undefined"', () => {
    setup(null);

    expect(headingText()).toBe('New item');
    expect(heading().classList).toContain('placeholder');
    expect(header().querySelector('.item-id-badge')).toBeNull();
    expect(header().textContent).not.toContain('#');
  });

  it('shows a placeholder when an existing item\'s title is cleared or only whitespace', () => {
    setup({ id: 78, title: 'Runbook', boardId: 1, boardColumnId: 1 } as Item);

    for (const title of ['', '   ']) {
      component.form.controls['title'].setValue(title);
      fixture.detectChanges();

      expect(headingText()).withContext(JSON.stringify(title)).toBe('Item #78: Untitled item');
      expect(heading().classList).toContain('placeholder');
    }
  });

  it('names the dialog after the id and the title, with the id read only by screen readers', () => {
    setup({ id: 78, title: 'Runbook', boardId: 1, boardColumnId: 1 } as Item);

    // matDialogTitle registers this id as the dialog container's aria-labelledby.
    expect(heading().classList).toContain('mat-mdc-dialog-title');
    expect(heading().id).toMatch(/^mat-mdc-dialog-title-/);

    const prefix = heading().querySelector<HTMLElement>('.visually-hidden')!;
    expect(prefix.textContent!.trim()).toBe('Item #78:');
    expect(prefix.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it('keeps a long title on one line with an ellipsis, the full title in a focusable tooltip', () => {
    setup({ id: 78, title: longTitle.replace(/ /g, ''), boardId: 1, boardColumnId: 1 } as Item);
    header().style.width = '360px';

    const style = getComputedStyle(heading());
    expect(style.whiteSpace).toBe('nowrap');
    expect(style.overflow).toBe('hidden');
    expect(style.textOverflow).toBe('ellipsis');
    expect(heading().scrollWidth).toBeGreaterThan(heading().clientWidth);
    expect(heading().getAttribute('tabindex')).toBe('0');
    expect(component.displayTitle).toBe(longTitle.replace(/ /g, ''));
  });
});
