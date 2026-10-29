import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';

import { WaitingTrayComponent, groupByBoard, waitingReason, waitingWith } from './waiting-tray.component';
import { AskAttentionService } from '../../_services/ask-attention.service';
import { BoardItemAskService } from '../../_services/board-item-ask.service';
import { AskState, AskTurnReason, BoardItemAsk } from '../../models/board-item-ask.model';
import { makeAsk } from '../../models/board-item-ask.testing';

describe('WaitingTrayComponent', () => {
  let fixture: ComponentFixture<WaitingTrayComponent>;
  let component: WaitingTrayComponent;
  let count: ReturnType<typeof signal<number | null>>;
  let getMine: jasmine.Spy;
  let trayRequests: Subject<void>;

  const asks: BoardItemAsk[] = [
    makeAsk({ id: 1, boardId: 2, boardTitle: 'Other', boardItemTitle: 'Index', yourMove: AskTurnReason.Respond, note: 'Check the index' }),
    makeAsk({ id: 2, boardId: 3, boardTitle: 'Release', boardItemTitle: 'Notes', yourMove: AskTurnReason.Deliver, state: AskState.Accepted, dueDate: '2026-10-28T00:00:00Z' }),
    makeAsk({
      id: 3, boardId: 3, boardTitle: 'Release', boardItemTitle: 'Notes', yourMove: AskTurnReason.ResolveRequirement,
      state: AskState.Declined, isRequired: true, recipientFullName: 'Ayse Recipient'
    })
  ];

  function setup(initialCount: number | null, list: BoardItemAsk[] = asks): void {
    count = signal<number | null>(initialCount);
    trayRequests = new Subject<void>();
    getMine = jasmine.createSpy('getMine').and.returnValue(of(list));

    TestBed.configureTestingModule({
      imports: [WaitingTrayComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AskAttentionService, useValue: { count, refresh: () => { }, trayRequests$: trayRequests } },
        { provide: BoardItemAskService, useValue: { getMine } }
      ]
    });
    fixture = TestBed.createComponent(WaitingTrayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const button = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.tray-button');
  const panel = () => document.querySelector<HTMLElement>('#waiting-tray-panel');

  afterEach(() => component?.close());

  it('stays out of the header until the count is known (signed out)', () => {
    setup(null);
    expect(button()).toBeNull();
  });

  it('shows no badge at zero, and says so to screen readers', () => {
    setup(0);

    expect(button()!.querySelector('.tray-count')).toBeNull();
    expect(button()!.getAttribute('aria-label')).toBe('Waiting for you: nothing');
  });

  it('shows the count as a number', () => {
    setup(3);

    expect(button()!.querySelector('.tray-count')!.textContent!.trim()).toBe('3');
    expect(button()!.getAttribute('aria-label')).toBe('Waiting for you: 3');
    expect(button()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('lists your moves grouped by board, each saying why and with whom', fakeAsync(() => {
    setup(3);

    button()!.click();
    fixture.detectChanges();
    tick();

    expect(getMine).toHaveBeenCalledOnceWith('waiting');
    expect(button()!.getAttribute('aria-expanded')).toBe('true');
    const boards = Array.from(panel()!.querySelectorAll('.tray-board')).map(h => h.textContent!.trim());
    expect(boards).toEqual(['Other', 'Release']);
    const reasons = Array.from(panel()!.querySelectorAll('.tray-reason')).map(r => r.textContent!.trim());
    expect(reasons).toEqual([
      'Asked you to help', 'You accepted. Mark it done when finished', 'Declined and required: ask someone else or waive it'
    ]);
    expect(panel()!.querySelectorAll('.tray-meta')[2].textContent!.trim()).toBe('You asked Ayse Recipient');
    // The list is the fresher count.
    expect(count()).toBe(3);
  }));

  it('keeps the title above the list, which scrolls on its own inside the rounded panel', fakeAsync(() => {
    setup(3);
    button()!.click();
    fixture.detectChanges();
    tick();

    const title = panel()!.querySelector('.tray-title')!;
    const scroll = panel()!.querySelector('.tray-scroll')!;
    expect(title.parentElement).toBe(panel());
    expect(scroll.parentElement).toBe(panel());
    expect(scroll.contains(title)).toBeFalse();
    expect(scroll.querySelectorAll('.tray-board').length).toBe(2);
    expect(scroll.querySelectorAll('.tray-row').length).toBe(3);
    expect(getComputedStyle(panel()!).overflowY).toBe('hidden');
    expect(getComputedStyle(scroll).overflowY).toBe('auto');
    // Focus still opens on the first row, now inside the scrolling list.
    expect(document.activeElement).toBe(scroll.querySelector('.tray-row'));
  }));

  it('opens the item with the ask in view from a row, and closes', fakeAsync(() => {
    setup(1, [asks[0]]);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);

    button()!.click();
    fixture.detectChanges();
    tick();
    const row = panel()!.querySelector<HTMLAnchorElement>('.tray-row')!;
    expect(row.getAttribute('href')).toBe('/board?openItemId=10&boardId=2&askId=1');

    row.click();
    fixture.detectChanges();
    tick();

    expect(router.navigateByUrl).toHaveBeenCalled();
    expect(panel()).toBeNull();
  }));

  it('closes on Escape and gives focus back to the button', fakeAsync(() => {
    setup(1);
    button()!.click();
    fixture.detectChanges();
    tick();

    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    tick();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
  }));

  it('opens when a toast asks for it', fakeAsync(() => {
    setup(2);

    trayRequests.next();
    fixture.detectChanges();
    tick();

    expect(panel()).not.toBeNull();
    expect(getMine).toHaveBeenCalledOnceWith('waiting');
  }));

  it('says when nothing is waiting, or when the list could not load', fakeAsync(() => {
    setup(0, []);
    button()!.click();
    fixture.detectChanges();
    tick();
    expect(panel()!.querySelector('.tray-note')!.textContent!.trim()).toBe('Nothing is waiting for you.');
    expect(count()).toBe(0);

    component.close();
    getMine.and.returnValue(throwError(() => new Error('offline')));
    button()!.click();
    fixture.detectChanges();
    tick();
    expect(panel()!.querySelector('.tray-note')!.textContent!.trim()).toContain("Couldn't load");
  }));
});

describe('waiting tray wording', () => {
  it('asks for an answer only when one is expected and missing', () => {
    const deliver = (expectsAnswer: boolean, isAnswered: boolean) =>
      waitingReason(makeAsk({ yourMove: AskTurnReason.Deliver, state: AskState.Accepted, expectsAnswer, isAnswered }));

    expect(deliver(true, false)).toBe('You accepted. An answer is needed');
    expect(deliver(true, true)).toBe('You accepted. Mark it done when finished');
    expect(deliver(false, false)).toBe('You accepted. Mark it done when finished');
  });

  it('names a cancelled required ask as cancelled', () => {
    expect(waitingReason(makeAsk({ yourMove: AskTurnReason.ResolveRequirement, state: AskState.Cancelled, isRequired: true })))
      .toBe('Cancelled and required: ask someone else or waive it');
  });

  it('says who asked you, or whom you asked', () => {
    expect(waitingWith(makeAsk({ yourMove: AskTurnReason.Respond, requestedByFullName: 'Rae Requester' }))).toBe('From Rae Requester');
    expect(waitingWith(makeAsk({ yourMove: AskTurnReason.ResolveRequirement, recipientFullName: 'Ayse Recipient' })))
      .toBe('You asked Ayse Recipient');
  });

  it('groups consecutive asks of one board, keeping the server order', () => {
    const groups = groupByBoard([
      makeAsk({ id: 1, boardId: 2, boardTitle: 'Other' }),
      makeAsk({ id: 2, boardId: 3, boardTitle: 'Release' }),
      makeAsk({ id: 3, boardId: 3, boardTitle: 'Release' })
    ]);

    expect(groups.map(g => [g.boardTitle, g.asks.map(a => a.id)])).toEqual([['Other', [1]], ['Release', [2, 3]]]);
  });
});
