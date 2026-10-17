import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { BoardItemAskService } from './board-item-ask.service';
import { environment } from '../../environments/environment';

describe('BoardItemAskService', () => {
  let service: BoardItemAskService;
  let httpMock: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    service = TestBed.inject(BoardItemAskService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getForItem() GETs the item\'s asks', () => {
    service.getForItem(42).subscribe();

    const req = httpMock.expectOne(`${api}/BoardItems/42/asks`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush([]);
  });

  it('getMine() passes the direction as a query parameter', () => {
    service.getMine('sent').subscribe();

    const req = httpMock.expectOne(r => r.url === `${api}/BoardItemAsks/mine`);
    expect(req.request.params.get('direction')).toBe('sent');
    req.flush([]);
  });

  it('create() POSTs the ask to the item', () => {
    const body = { recipientUserId: 'u2', note: 'Review', isRequired: true, dueDate: null, replacesAskId: 9 };

    service.create(42, body).subscribe();

    const req = httpMock.expectOne(`${api}/BoardItems/42/asks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('update() PUTs the full terms with the expected revision', () => {
    const body = { expectedRevision: 3, note: 'Review', dueDate: null, isRequired: false, waiveReason: 'Done in person' };

    service.update(7, body).subscribe();

    const req = httpMock.expectOne(`${api}/BoardItemAsks/7`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('changeState() POSTs to the explicit action route with the revision and reason', () => {
    service.changeState(7, 'decline', 3, 'Busy').subscribe();

    const req = httpMock.expectOne(`${api}/BoardItemAsks/7/decline`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ expectedRevision: 3, reason: 'Busy' });
    req.flush({});
  });

  it('nudge() and reassign() POST to their routes', () => {
    service.nudge(7).subscribe();
    service.reassign(7, { expectedRevision: 3, newRecipientUserId: 'u3' }).subscribe();

    httpMock.expectOne(r => r.url === `${api}/BoardItemAsks/7/nudge` && r.method === 'POST').flush({});
    const reassign = httpMock.expectOne(`${api}/BoardItemAsks/7/reassign`);
    expect(reassign.request.body).toEqual({ expectedRevision: 3, newRecipientUserId: 'u3' });
    reassign.flush({});
  });
});
