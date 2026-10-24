import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import {
  CHIME_RAIL_DEFAULT,
  CHIME_RAIL_MIN,
  DIALOG_BASE_WIDTH,
  ITEM_DIALOG_CONFIG,
  ItemDetailDialogComponent,
  ItemDetailDialogData
} from './item-detail-dialog.component';
import { AuthService } from '../../_services/auth.service';
import { OpenAskItemsService } from '../../_services/open-ask-items.service';
import { Item } from '../../models/board.model';
import { environment } from '../../../environments/environment';
import { of } from 'rxjs';
import { AskCompletionService } from '../../_services/ask-completion.service';
import { BoardItemAskService } from '../../_services/board-item-ask.service';
import { AskClosure, AskState, BoardItemAsk } from '../../models/board-item-ask.model';
import { makeAsk } from '../../models/board-item-ask.testing';

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
        { provide: MatDialogRef, useValue: { close: () => { }, updateSize: () => { } } }
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
  let dialogRefSpy: { close: jasmine.Spy; updateSize: jasmine.Spy };

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
    dialogRefSpy = { close: jasmine.createSpy('close'), updateSize: jasmine.createSpy('updateSize') };

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
        { provide: MatDialogRef, useValue: { close: () => { }, updateSize: () => { } } }
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
        { provide: MatDialogRef, useValue: { close: () => { }, updateSize: () => { } } }
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
        { provide: MatDialogRef, useValue: { close: () => { }, updateSize: () => { } } }
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

describe('ItemDetailDialogComponent — completing an item with asks', () => {
  let component: ItemDetailDialogComponent;
  let httpMock: HttpTestingController;
  let dialogRef: { close: jasmine.Spy; updateSize: jasmine.Spy };
  let askCompletion: { completeItem: jasmine.Spy };
  let asksAfterLoad: BoardItemAsk[];
  let element: HTMLElement;
  let detectChanges: () => void;

  const statuses = [{ id: 3, name: 'In Progress' }, { id: 5, name: 'Done' }];
  const closure: AskClosure = { acknowledgedAsks: [{ askId: 1, revision: 2 }], completeAskIds: [1], overrideAskIds: [] };

  function setup(statusId: number): void {
    dialogRef = { close: jasmine.createSpy('close'), updateSize: jasmine.createSpy('updateSize') };
    askCompletion = { completeItem: jasmine.createSpy('completeItem').and.callFake((_id: number, _title: string, save: (c: AskClosure) => unknown) => save(closure)) };
    asksAfterLoad = [makeAsk({ id: 1, state: AskState.Accepted })];

    TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { item: { id: 9, title: 'Release notes', boardId: 7, boardColumnId: 3, status: { id: statusId, name: '' } }, boardId: 7 } as ItemDetailDialogData },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: AskCompletionService, useValue: askCompletion },
        { provide: BoardItemAskService, useValue: { getForItem: () => of(asksAfterLoad) } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ItemDetailDialogComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    detectChanges = () => fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/BoardItems/GetStatuses?boardId=7`).flush(statuses);
    flush(); // the panel emits its summary asynchronously
  }

  it('opens the History tab from an ask\'s "Full history"', fakeAsync(() => {
    setup(3);
    expect(component.selectedTabIndex ?? component.initialTabIndex).toBe(0);

    const toggle = element.querySelector<HTMLButtonElement>('.details-chime .ask-details-toggle')!;
    toggle.click();
    detectChanges();
    element.querySelector<HTMLButtonElement>('.details-chime .ask-full-history')!.click();

    expect(component.selectedTabIndex).toBe(component.historyTabIndex);
    expect(component.historyTabIndex).toBe(3);
    flush();
  }));

  it('places Chime In in its own column, after the fields in reading order', fakeAsync(() => {
    setup(3);

    const main = element.querySelector('.details-layout .details-grid > .details-main')!;
    const chime = element.querySelector('.details-layout .details-grid > .details-chime')!;
    expect(main.querySelector('input[formcontrolname="title"]')).not.toBeNull();
    expect(chime.querySelector('app-board-item-asks')).not.toBeNull();
    expect(main.querySelector('app-board-item-asks')).toBeNull();
    // Fields first, then Chime In: keyboard and screen-reader order match what users see.
    expect(main.compareDocumentPosition(chime) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chime.querySelector('#asks-heading')!.textContent!.trim()).toBe('group_add Chime In');
  }));

  it('moving the item to Done goes through the completion prompt and sends its closure', fakeAsync(() => {
    setup(3);
    component.form.patchValue({ statusId: 5 });

    component.onSave();

    expect(askCompletion.completeItem).toHaveBeenCalledOnceWith(9, 'Release notes', jasmine.any(Function));
    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItems/9`);
    expect(req.request.body.askClosure).toEqual(closure);
    expect(req.request.body.statusId).toBe(5);

    asksAfterLoad = [makeAsk({ id: 1, state: AskState.Completed })];
    req.flush({ id: 9, title: 'Release notes' });

    // The completion changed the asks: the card gets the reloaded summary.
    const result = dialogRef.close.calls.mostRecent().args[0];
    expect(result.type).toBe('saved');
    expect(result.item.askSummary).toEqual(jasmine.objectContaining({ openCount: 0, completedCount: 1 }));
  }));

  it('saves nothing and stays open when the prompt is cancelled', fakeAsync(() => {
    setup(3);
    askCompletion.completeItem.and.returnValue(of(null));
    component.form.patchValue({ statusId: 5 });

    component.onSave();

    httpMock.expectNone(`${environment.apiUrl}/BoardItems/9`);
    expect(dialogRef.close).not.toHaveBeenCalled();
  }));

  it('other saves skip the prompt and send no closure', fakeAsync(() => {
    setup(3);
    component.form.patchValue({ title: 'Release notes v2' });

    component.onSave();

    expect(askCompletion.completeItem).not.toHaveBeenCalled();
    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItems/9`);
    expect(req.request.body.askClosure).toBeUndefined();
    req.flush({ id: 9, title: 'Release notes v2' });

    // The card keeps the summary the panel last loaded.
    expect(dialogRef.close.calls.mostRecent().args[0].item.askSummary).toEqual(jasmine.objectContaining({ openCount: 1 }));
  }));

  it('saving an item that is already Done skips the prompt', fakeAsync(() => {
    setup(5);
    component.form.patchValue({ title: 'Renamed' });

    component.onSave();

    expect(askCompletion.completeItem).not.toHaveBeenCalled();
    httpMock.expectOne(`${environment.apiUrl}/BoardItems/9`).flush({ id: 9 });
  }));

  it('passes every loaded ask summary on, so the board card stays current while the dialog is open', fakeAsync(() => {
    setup(3);
    const emitted: unknown[] = [];
    component.askSummaryChange.subscribe(s => emitted.push(s));

    component.onAskSummaryChange({ openCount: 4, unmetRequiredCount: 1, completedCount: 0, openAsks: [] });

    expect(emitted).toEqual([jasmine.objectContaining({ openCount: 4 })]);
  }));
});

describe('ItemDetailDialogComponent — Chime In beside the fields', () => {
  let component: ItemDetailDialogComponent;
  let fixture: ComponentFixture<ItemDetailDialogComponent>;
  let element: HTMLElement;

  const statuses = [{ id: 3, name: 'In Progress' }, { id: 5, name: 'Done' }];
  // One open ask waiting on the viewer, one on someone else.
  const asks = [
    makeAsk({ id: 1, state: AskState.Pending, recipientUserId: 'me' }),
    makeAsk({ id: 2, state: AskState.Accepted, recipientUserId: 'someone-else' })
  ];

  function open(): void {
    fixture = TestBed.createComponent(ItemDetailDialogComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/BoardItems/GetStatuses?boardId=7`).flush(statuses);
    flush(); // the panel emits its summary asynchronously
    fixture.detectChanges();
    // As the ResizeObserver would report a full-size dialog's Details content.
    component.onLayoutResized(1117);
    fixture.detectChanges();
  }

  function setup(): void {
    TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { item: { id: 9, title: 'Release notes', boardId: 7, boardColumnId: 3, status: { id: 3, name: '' } }, boardId: 7 } as ItemDetailDialogData },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close'), updateSize: jasmine.createSpy('updateSize') } },
        { provide: AskCompletionService, useValue: { completeItem: jasmine.createSpy('completeItem') } },
        { provide: BoardItemAskService, useValue: { getForItem: () => of(asks) } }
      ]
    }).compileComponents();
    spyOn(TestBed.inject(AuthService), 'getUserId').and.returnValue('me');
    open();
  }

  const separator = () => element.querySelector<HTMLElement>('.details-separator');
  const chime = () => element.querySelector<HTMLElement>('.details-chime')!;
  const reveal = () => element.querySelector<HTMLButtonElement>('.chime-reveal');
  const key = (name: string) => {
    separator()!.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
    fixture.detectChanges();
  };
  const pointer = (type: string, clientX: number) => {
    separator()!.dispatchEvent(new PointerEvent(type, { button: 0, pointerId: 1, clientX, cancelable: true, bubbles: true }));
    fixture.detectChanges();
  };

  it('opens with Chime In visible at 360px, and a separator that reports the Details width', fakeAsync(() => {
    setup();

    expect(component.chimeHidden).toBeFalse();
    expect(component.railWidth).toBe(CHIME_RAIL_DEFAULT);
    const divider = separator()!;
    expect(divider.getAttribute('role')).toBe('separator');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.getAttribute('tabindex')).toBe('0');
    expect(divider.getAttribute('aria-valuenow')).toBe(String(1117 - 49 - 360));
    expect(divider.getAttribute('aria-valuemin')).toBe('560');
    expect(divider.getAttribute('aria-valuemax')).toBe(String(1117 - 49 - 320));
    expect(divider.getAttribute('aria-valuetext')).toBe('Details 708 pixels, Chime In 360 pixels');
    expect(element.querySelector('.details-grid')!.getAttribute('style')).toContain('--chime-width: 360px');
  }));

  it('resizes with the arrow keys, and Home and End go to the limits', fakeAsync(() => {
    setup();

    key('ArrowLeft');
    expect(component.railWidth).toBe(376);
    key('ArrowRight');
    key('ArrowRight');
    expect(component.railWidth).toBe(344);

    key('Home');
    expect(component.railWidth).toBe(1117 - 560 - 49);
    key('ArrowLeft');
    expect(component.railWidth).toBe(1117 - 560 - 49);

    key('End');
    expect(component.railWidth).toBe(CHIME_RAIL_MIN);
    key('ArrowRight');
    expect(component.railWidth).toBe(CHIME_RAIL_MIN);
  }));

  it('resets to 360px on double-click', fakeAsync(() => {
    setup();
    key('End');

    separator()!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    expect(component.railWidth).toBe(CHIME_RAIL_DEFAULT);
  }));

  it('drags within the limits, and every way a drag can end ends it', fakeAsync(() => {
    setup();

    pointer('pointerdown', 700);
    expect(component.resizing).toBeTrue();
    expect(element.querySelector('.details-layout')!.classList).toContain('resizing');
    pointer('pointermove', 600);
    expect(component.railWidth).toBe(460);
    pointer('pointermove', 0);
    expect(component.railWidth).toBe(1117 - 560 - 49);
    pointer('pointermove', 2000);
    expect(component.railWidth).toBe(CHIME_RAIL_MIN);
    pointer('pointerup', 2000);
    expect(component.resizing).toBeFalse();

    // Moves after the drag ended change nothing.
    pointer('pointermove', 0);
    expect(component.railWidth).toBe(CHIME_RAIL_MIN);

    for (const end of ['pointercancel', 'lostpointercapture']) {
      pointer('pointerdown', 700);
      pointer(end, 700);
      expect(component.resizing).withContext(end).toBeFalse();
    }
  }));

  it('keeps the fields at their minimum when the dialog gets narrower', fakeAsync(() => {
    setup();
    key('Home');

    component.onLayoutResized(1024);
    expect(component.railWidth).toBe(1024 - 560 - 49);

    component.onLayoutResized(900);
    expect(component.railWidth).toBe(CHIME_RAIL_MIN);
  }));

  it('hides Chime In, keeps it loaded, and brings it back with a count from the header', fakeAsync(() => {
    setup();
    const openItems = TestBed.inject(OpenAskItemsService);
    expect(openItems.isOpen(9)).toBeTrue();
    key('ArrowLeft');

    element.querySelector<HTMLButtonElement>('.asks-hide')!.click();
    fixture.detectChanges();
    tick();

    expect(component.chimeHidden).toBeTrue();
    expect(separator()).toBeNull();
    expect(element.querySelector('.details-grid')!.classList).toContain('chime-hidden');
    expect(chime().querySelector('app-board-item-asks')).not.toBeNull();
    expect(getComputedStyle(chime()).display).toBe('none');
    // Hidden: new asks and replies on this item may raise toasts again.
    expect(openItems.isOpen(9)).toBeFalse();

    const button = reveal()!;
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('chime-in-panel');
    expect(button.getAttribute('aria-label')).toBe('Show Chime In: 2 open asks, 1 waiting for you');
    expect(button.querySelector('.chime-count')!.textContent!.trim()).toBe('2');
    expect(button.classList).toContain('waiting');

    // The panel keeps loading while hidden, so the count follows the asks.
    component.onAskSummaryChange({ openCount: 1, unmetRequiredCount: 0, completedCount: 1, openAsks: [
      { askId: 2, recipientUserId: 'someone-else', recipientFullName: 'S', state: AskState.Accepted, isRequired: false, dueDate: null, dateCreated: '2026-10-10T09:00:00Z' }
    ] });
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Show Chime In: 1 open ask');
    expect(button.classList).not.toContain('waiting');

    component.selectedTabIndex = 3;
    button.click();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(component.chimeHidden).toBeFalse();
    expect(component.selectedTabIndex).toBe(0);
    expect(reveal()).toBeNull();
    expect(openItems.isOpen(9)).toBeTrue();
    // The width the user chose survives hiding.
    expect(component.railWidth).toBe(376);
    flush();
  }));

  it('moves focus to the Chime In heading when it comes back', fakeAsync(() => {
    setup();
    element.querySelector<HTMLButtonElement>('.asks-hide')!.click();
    fixture.detectChanges();
    tick();

    reveal()!.click();
    fixture.detectChanges();
    tick();

    expect(document.activeElement).toBe(element.querySelector('#asks-heading'));
  }));

  it('keeps the rail width while hidden, whatever the narrower hidden layout measures', fakeAsync(() => {
    setup();
    key('Home');
    component.hideChime();
    fixture.detectChanges();
    tick();

    component.onLayoutResized(700);
    component.showChime();
    fixture.detectChanges();
    tick();

    expect(component.layoutWidth).toBe(1117);
    expect(component.railWidth).toBe(1117 - 560 - 49);
  }));

  it('moves focus to the Chime In heading when it comes back from another tab', fakeAsync(() => {
    setup();
    element.querySelector<HTMLButtonElement>('.asks-hide')!.click();
    fixture.detectChanges();
    tick();
    component.selectedTabIndex = 3;
    fixture.detectChanges();
    flush();
    fixture.detectChanges();
    expect(element.querySelector('#asks-heading')).toBeNull();

    reveal()!.click();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();
    flush();

    expect(document.activeElement).toBe(element.querySelector('#asks-heading'));
  }));

  it('stacks the fields in one column when Details is narrower than 600px', fakeAsync(() => {
    setup();
    const main = element.querySelector<HTMLElement>('.details-main')!;
    const tracks = () => getComputedStyle(main.querySelector('.form-grid')!).gridTemplateColumns.split(' ').length;

    main.style.width = '560px';
    expect(tracks()).toBe(1);
    // A narrow test window stacks the fields anyway (the 768px media rule).
    if (!matchMedia('(max-width: 768px)').matches) {
      main.style.width = '700px';
      expect(tracks()).toBe(2);
    }
  }));

  it('starts every new dialog visible at 360px', fakeAsync(() => {
    setup();
    key('Home');
    component.hideChime();
    fixture.detectChanges();
    tick();
    fixture.destroy();

    open();

    expect(component.chimeHidden).toBeFalse();
    expect(component.railWidth).toBe(CHIME_RAIL_DEFAULT);
    expect(separator()).not.toBeNull();
  }));
});

describe('ItemDetailDialogComponent — its width follows Chime In', () => {
  let component: ItemDetailDialogComponent;
  let fixture: ComponentFixture<ItemDetailDialogComponent>;
  let element: HTMLElement;
  let pane: HTMLElement;
  let updateSize: jasmine.Spy;
  /** The window width that 95vw resolves against: the test window itself is far narrower. */
  let windowWidth: number;

  const visible = 'min(1309px, 95vw)';

  function open(width: number): void {
    windowWidth = width;
    // A stand-in for the overlay pane: updateSize writes its width as a window this wide would resolve it.
    pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    // A real pane has the dialog's height, so only the tab content scrolls.
    pane.style.height = '800px';
    document.body.appendChild(pane);
    updateSize = jasmine.createSpy('updateSize').and.callFake((w: string) => {
      pane.style.width = w.replace('95vw', `${windowWidth * 0.95}px`);
    });

    TestBed.configureTestingModule({
      imports: [ItemDetailDialogComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { item: { id: 9, title: 'Release notes', boardId: 7, boardColumnId: 3, status: { id: 3, name: '' } }, boardId: 7 } as ItemDetailDialogData },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close'), updateSize } },
        { provide: AskCompletionService, useValue: { completeItem: jasmine.createSpy('completeItem') } },
        { provide: BoardItemAskService, useValue: { getForItem: () => of([makeAsk({ id: 1, state: AskState.Pending })]) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ItemDetailDialogComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    pane.appendChild(element);
    // The narrow test window would apply the phone rules to the dialog; fill the pane instead.
    element.style.setProperty('width', '100%', 'important');
    element.style.setProperty('max-width', 'none', 'important');
    element.style.setProperty('height', '100%', 'important');
    element.style.setProperty('max-height', 'none', 'important');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/BoardItems/GetStatuses?boardId=7`).flush([]);
    flush();
    fixture.detectChanges();
    observe();
  }

  /** What the ResizeObserver would report for the Details layout as it is now. */
  function observe(): void {
    component.onLayoutResized(layout().getBoundingClientRect().width);
    fixture.detectChanges();
  }

  const layout = () => element.querySelector<HTMLElement>('.details-layout')!;
  const mainWidth = () => element.querySelector<HTMLElement>('.details-main')!.getBoundingClientRect().width;
  const separator = () => element.querySelector<HTMLElement>('.details-separator');
  const lastWidth = () => updateSize.calls.mostRecent().args[0] as string;

  function hide(): void {
    component.hideChime();
    fixture.detectChanges();
    tick();
  }

  function resizeWindow(width: number): void {
    windowWidth = width;
    spyOnProperty(window, 'innerWidth').and.returnValue(width);
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    pane?.remove();
  });

  it('opens at the base width plus the rail and its separator, with the height from the shared config', fakeAsync(() => {
    open(1500);

    expect(updateSize.calls.first().args).toEqual([visible, ITEM_DIALOG_CONFIG.height]);
    expect(DIALOG_BASE_WIDTH + 49 + CHIME_RAIL_DEFAULT).toBe(1309);
    expect(pane.getBoundingClientRect().width).toBe(1309);
  }));

  it('measures the chrome and the rail layout from the DOM while Chime In is visible', fakeAsync(() => {
    open(1500);

    expect(component['dialogChrome']).toBe(pane.offsetWidth - layout().getBoundingClientRect().width);
    expect(getComputedStyle(separator()!).display).toBe('block');
    expect(component['railLayout']).toBeTrue();
  }));

  it('hides Chime In beside the fields by taking away exactly the rail and separator', fakeAsync(() => {
    open(1500);
    component.setRailWidth(500);
    fixture.detectChanges();
    const before = mainWidth();

    hide();

    expect(lastWidth()).toBe(`calc(${visible} - 549px)`);
    expect(mainWidth()).toBe(before);

    component.showChime();
    fixture.detectChanges();
    tick();
    observe();

    expect(lastWidth()).toBe(visible);
    expect(mainWidth()).toBe(before);
    expect(component.railWidth).toBe(500);
  }));

  it('keeps the width when Chime In is under the fields', fakeAsync(() => {
    open(1000);
    expect(getComputedStyle(separator()!).display).toBe('none');
    expect(component['railLayout']).toBeFalse();
    const paneWidth = pane.getBoundingClientRect().width;

    hide();

    expect(lastWidth()).toBe(visible);
    expect(pane.getBoundingClientRect().width).toBe(paneWidth);
  }));

  it('re-clamps the rail with the measured chrome when the window narrows while Chime In is hidden', fakeAsync(() => {
    open(1500);
    const chrome = component['dialogChrome']!;
    component.setRailWidth(component.railMax);
    hide();

    resizeWindow(1200);

    const visibleContent = Math.round(1200 * 0.95 - chrome);
    expect(component.railWidth).toBe(visibleContent - 560 - 49);
    expect(lastWidth()).toBe(`calc(${visible} - ${component.railWidth + 49}px)`);
  }));

  it('predicts the layout as the container query would: under 1024px of content it stacks', fakeAsync(() => {
    open(1500);
    const chrome = component['dialogChrome']!;
    hide();

    // Room for the fields' 560px beside the rail, but under the container query's 1024px.
    const width = Math.ceil((1000 + chrome) / 0.95);
    resizeWindow(width);

    expect(component['railLayout']).toBeFalse();
    expect(lastWidth()).toBe(visible);
  }));

  it('checks the prediction when the hidden layout changes size, even without a resize event', fakeAsync(() => {
    open(1500);
    hide();

    // The window narrowed into the stacked range, but no resize event arrived: only the observer saw it.
    windowWidth = 1000;
    spyOnProperty(window, 'innerWidth').and.returnValue(1000);
    component.onLayoutResized(500);

    expect(component['railLayout']).toBeFalse();
    expect(lastWidth()).toBe(visible);
    expect(component.railWidth).toBe(CHIME_RAIL_DEFAULT);
  }));

  it('never resizes the dialog on a tab switch', fakeAsync(() => {
    open(1500);
    const calls = updateSize.calls.count();

    // Work History, History and Info; Comments and Relationships load editors and graphs not needed here.
    for (const tab of [2, 3, 5, 0]) {
      component.selectedTabIndex = tab;
      fixture.detectChanges();
      flush();
    }
    hide();
    const hiddenCalls = updateSize.calls.count();
    for (const tab of [3, 5, 0]) {
      component.selectedTabIndex = tab;
      fixture.detectChanges();
      flush();
    }

    expect(hiddenCalls).toBe(calls + 1);
    expect(updateSize.calls.count()).toBe(hiddenCalls);
  }));
});
