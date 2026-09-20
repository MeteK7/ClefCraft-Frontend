import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { BoardComponent } from './board.component';
import { BoardDialogComponent } from '../board-dialog/board-dialog.component';
import { environment } from '../../../environments/environment';

describe('BoardComponent', () => {
  let component: BoardComponent;
  let fixture: ComponentFixture<BoardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardComponent],
      providers: [
        provideHttpClient(),
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
        provideHttpClient(),
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
