import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { BoardService } from './board.service';
import { environment } from '../../environments/environment';

describe('BoardService', () => {
  let service: BoardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BoardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('getBoards() GETs api/Boards with credentials', () => {
    const boards = [{ id: 1, title: 'My Board', boardColumns: [] }];

    service.getBoards().subscribe(result => {
      expect(result).toEqual(boards);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/Boards`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush(boards);
  });

  it('createBoard() POSTs the title to api/Boards and returns the created board', () => {
    const created = { id: 5, title: 'New Board', boardColumns: [] };

    service.createBoard({ title: 'New Board' }).subscribe(result => {
      expect(result).toEqual(created);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/Boards`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'New Board' });
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    expect(req.request.withCredentials).toBeTrue();
    req.flush(created);
  });

  // Pinned to the routes BoardItemsController actually exposes: PUT api/BoardItems/{id} and
  // POST api/BoardItems/SwitchColumn. (A removed updateItem() used to PUT to a non-existent
  // api/BoardItems/Update.)
  it('updateBoardItem() PUTs the item to api/BoardItems/{id}', () => {
    const item = { id: 28, title: 'Practice arpeggios', boardId: 8, boardColumnId: 34 } as any;

    service.updateBoardItem(item).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItems/28`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(item);
    req.flush(item);
  });

  it('switchBoardItemColumn() POSTs { id, boardColumnId } to api/BoardItems/SwitchColumn', () => {
    service.switchBoardItemColumn({ id: 28, boardColumnId: 35 }).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItems/SwitchColumn`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ id: 28, boardColumnId: 35 });
    req.flush({});
  });
});
