import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { UserService } from './user.service';
import { environment } from '../../environments/environment';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()]
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("gets assignees from the board's member list and maps them to { id, fullName }", () => {
    let result: unknown;
    service.getAssignees(3).subscribe(a => result = a);

    const req = httpMock.expectOne(`${environment.apiUrl}/Boards/3/Members`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 11, boardId: 3, userId: 'user-1', fullName: 'Jane Doe' }]);

    expect(result).toEqual([{ id: 'user-1', fullName: 'Jane Doe' }]);
  });
});
