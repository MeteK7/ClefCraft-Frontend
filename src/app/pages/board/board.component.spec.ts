import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { Subject, of } from 'rxjs';

import { ASK_REFRESH_DEBOUNCE_MS, BoardComponent } from './board.component';
import { AskEventPayload, NotificationRealtimeService } from '../../_services/notification-realtime.service';
import { AskState, AskTurnReason } from '../../models/board-item-ask.model';
import { makeAsk } from '../../models/board-item-ask.testing';
import { BoardDialogComponent } from '../board-dialog/board-dialog.component';
import { environment } from '../../../environments/environment';

describe('BoardComponent', () => {
  let component: BoardComponent;
  let fixture: ComponentFixture<BoardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('BoardComponent — board creation and empty state', () => {
  let component: BoardComponent;
  let fixture: ComponentFixture<BoardComponent>;
  let httpMock: HttpTestingController;
  let dialog: MatDialog;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BoardComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BoardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    // Grab the exact MatDialog instance the component itself holds, so spying on it is
    // guaranteed to intercept the component's own this.dialog.open(...) call.
    dialog = (component as any).dialog;
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('renders the empty-boards message and no board controls when the user has zero boards', async () => {
    await createComponent();

    httpMock.expectOne(`${environment.apiUrl}/Boards`).flush([]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-boards-state')).toBeTruthy();
    expect(compiled.querySelector('#boardId')).toBeFalsy();
    expect(compiled.querySelector('.add-item-btn')).toBeFalsy();
  });

  it('openCreateBoardDialog() creates the board via the service and selects it', async () => {
    await createComponent();
    httpMock.expectOne(`${environment.apiUrl}/Boards`).flush([]);
    fixture.detectChanges();

    const newBoard = { id: 7, title: 'New Board', boardColumns: [] };
    spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of({ title: 'New Board' }) } as any);

    component.openCreateBoardDialog();

    httpMock.expectOne(`${environment.apiUrl}/Boards`).flush(newBoard);
    // loadBoardColumnItems() fires next for the newly selected board.
    httpMock.expectOne(`${environment.apiUrl}/BoardItems/GetBoardItemsByBoardId/7`).flush([]);

    expect(component.boards).toContain(newBoard);
    expect(component.selectedBoardId).toBe(7);
  });

  it('openCreateBoardDialog() does nothing when the dialog is cancelled', async () => {
    await createComponent();
    httpMock.expectOne(`${environment.apiUrl}/Boards`).flush([]);
    fixture.detectChanges();

    spyOn(dialog, 'open').and.returnValue({ afterClosed: () => of(null) } as any);

    component.openCreateBoardDialog();

    expect(component.boards.length).toBe(0);
  });

  it('openAddItemDialog() is a no-op when no board is selected', async () => {
    await createComponent();
    httpMock.expectOne(`${environment.apiUrl}/Boards`).flush([]);
    fixture.detectChanges();

    spyOn(dialog, 'open');

    component.openAddItemDialog();

    expect(dialog.open).not.toHaveBeenCalled();
  });
});

describe('BoardComponent — card ask summary', () => {
  let component: BoardComponent;
  let httpMock: HttpTestingController;

  const summary = (openCount: number) => ({ openCount, unmetRequiredCount: 0, completedCount: 0, openAsks: [] });

  async function createWithOneItem(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BoardComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()]
    }).compileComponents();

    const fixture = TestBed.createComponent(BoardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/Boards`).flush([{ id: 1, title: 'Release', boardColumns: [] }]);
    httpMock.expectOne(`${environment.apiUrl}/BoardItems/GetBoardItemsByBoardId/1`).flush([
      { id: 3, title: 'In Progress', boardItems: [{ id: 9, title: 'Release notes', boardId: 1, boardColumnId: 3, askSummary: summary(2) }] }
    ]);
  }

  const card = () => component.columns.flatMap(c => c.boardItems).find(i => i.id === 9)!;

  it('puts a fresh ask summary on the card, and on the item the dialog opens with next time', async () => {
    await createWithOneItem();

    component.applyAskState(9, summary(3));

    expect(card().askSummary!.openCount).toBe(3);
    expect(card().raw.askSummary!.openCount).toBe(3);
  });

  it('keeps the card\'s ask summary when a saved item comes back without one', async () => {
    await createWithOneItem();

    component.onItemUpdated({ id: 9, title: 'Renamed', boardColumnId: 3 } as any);

    expect(card().title).toBe('Renamed');
    expect(card().askSummary!.openCount).toBe(2);
  });

  it('takes the ask summary a completion save brings back', async () => {
    await createWithOneItem();

    component.onItemUpdated({ id: 9, title: 'Release notes', boardColumnId: 3, askSummary: summary(0) } as any);

    expect(card().askSummary!.openCount).toBe(0);
  });
});

describe('BoardComponent — ask links and live cards', () => {
  let component: BoardComponent;
  let httpMock: HttpTestingController;
  let router: Router;
  let askEvents$: Subject<AskEventPayload>;
  let dialogOpen: jasmine.Spy;
  let dialogClosed: Subject<unknown>;

  const item = (id: number, boardId: number) => ({ id, title: `Item ${id}`, boardId, boardColumnId: 3 });
  const itemsUrl = (boardId: number) => `${environment.apiUrl}/BoardItems/GetBoardItemsByBoardId/${boardId}`;
  const asksUrl = (itemId: number) => `${environment.apiUrl}/BoardItems/${itemId}/asks`;

  async function create(): Promise<void> {
    askEvents$ = new Subject<AskEventPayload>();
    await TestBed.configureTestingModule({
      imports: [BoardComponent],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations(),
        { provide: NotificationRealtimeService, useValue: { askEvents$, connected$: new Subject<void>() } }
      ]
    }).compileComponents();

    dialogClosed = new Subject<unknown>();
    dialogOpen = spyOn(TestBed.inject(MatDialog), 'open').and.callFake(() => ({
      componentInstance: { askSummaryChange: new Subject(), askAttentionChange: new Subject(), hasUnsavedChanges: false },
      keydownEvents: () => new Subject(),
      backdropClick: () => new Subject(),
      afterClosed: () => dialogClosed.asObservable()
    }) as any);

    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(BoardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/Boards`).flush([
      { id: 1, title: 'Release', boardColumns: [] }, { id: 2, title: 'Research', boardColumns: [] }
    ]);
    httpMock.expectOne(itemsUrl(1)).flush([{ id: 3, title: 'In Progress', boardItems: [item(9, 1)] }]);
  }

  const card = (id: number) => component.columns.flatMap(c => c.boardItems).find(i => i.id === id)!;
  const openedWith = () => dialogOpen.calls.mostRecent().args[1].data;

  it('opens the item with the ask in view, and drops the link', fakeAsync(async () => {
    await create();

    router.navigate([], { queryParams: { openItemId: 9, boardId: 1, askId: 5 } });
    tick();

    expect(openedWith()).toEqual(jasmine.objectContaining({ focusAskId: 5, focusCommentId: null }));
    expect(router.url).toBe('/');
  }));

  it('switches to the board the link names first, then opens the ask there', fakeAsync(async () => {
    await create();

    router.navigate([], { queryParams: { openItemId: 20, boardId: 2, askId: 5 } });
    tick();
    expect(dialogOpen).not.toHaveBeenCalled();

    httpMock.expectOne(itemsUrl(2)).flush([{ id: 3, title: 'In Progress', boardItems: [item(20, 2)] }]);
    tick();

    expect(component.selectedBoardId).toBe(2);
    expect(openedWith()).toEqual(jasmine.objectContaining({ boardId: 2, focusAskId: 5 }));
  }));

  it('drops a link whose item isn\'t on its board, so it can\'t pull the page back later', fakeAsync(async () => {
    await create();

    router.navigate([], { queryParams: { openItemId: 99, boardId: 1, askId: 5 } });
    tick();

    expect(dialogOpen).not.toHaveBeenCalled();
    expect(router.url).toBe('/');
  }));

  it('opens an ask in the dialog even in sidebar mode: only the dialog has Chime In', fakeAsync(async () => {
    await create();
    component.viewMode = 'sidebar';

    router.navigate([], { queryParams: { openItemId: 9, boardId: 1, askId: 5 } });
    tick();

    expect(openedWith()).toEqual(jasmine.objectContaining({ focusAskId: 5 }));
  }));

  const pushed = (boardItemId: number, boardId = 1) => askEvents$.next({
    askId: 5, boardItemId, boardId, itemTitle: 'Item', event: 'Requested', actorFullName: 'Rae', note: 'Help',
    reason: null, actedOnBehalf: false, replyId: null, replyExcerpt: null, occurredAt: '2026-10-25T10:00:00Z'
  });

  it('refetches only the card an ask event is about, once per burst, with its summary and "Your move"', fakeAsync(async () => {
    await create();

    pushed(9);
    pushed(9);
    pushed(20, 2);
    tick(ASK_REFRESH_DEBOUNCE_MS);

    httpMock.expectOne(asksUrl(9)).flush([makeAsk({ id: 5, boardItemId: 9, state: AskState.Pending, yourMove: AskTurnReason.Respond })]);
    httpMock.expectNone(asksUrl(20));

    expect(card(9).askAttention).toEqual({ yourMove: 1 });
    expect(card(9).askSummary!.openCount).toBe(1);
  }));

  it('leaves the card of an item whose dialog is open to that dialog', fakeAsync(async () => {
    await create();
    component.openItemDetailDialog(card(9));

    pushed(9);
    tick(ASK_REFRESH_DEBOUNCE_MS);
    httpMock.expectNone(asksUrl(9));

    dialogClosed.next(undefined);
    pushed(9);
    tick(ASK_REFRESH_DEBOUNCE_MS);
    httpMock.expectOne(asksUrl(9)).flush([]);
  }));

  it('puts the attention the dialog reports on the card', fakeAsync(async () => {
    await create();

    component.applyAskState(9, undefined, { yourMove: 2 });

    expect(card(9).askAttention).toEqual({ yourMove: 2 });
    expect(card(9).raw.askAttention).toEqual({ yourMove: 2 });
  }));
});
