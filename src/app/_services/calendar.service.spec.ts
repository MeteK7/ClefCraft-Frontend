import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CalendarService } from './calendar.service';
import { environment } from '../../environments/environment';

describe('CalendarService — attachments', () => {
  let service: CalendarService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CalendarService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('downloads from the API host, not a path relative to the SPA', () => {
    service.downloadAttachment(12).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/Calendar/attachments/download/12`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['x']));
  });
});
