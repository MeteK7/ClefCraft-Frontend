import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { AskCompletionService } from './ask-completion.service';
import { BoardItemAskService } from './board-item-ask.service';
import { ASKS_CHANGED_MESSAGE, AskClosure, AskState } from '../models/board-item-ask.model';
import { makeAsk } from '../models/board-item-ask.testing';

describe('AskCompletionService', () => {
  let service: AskCompletionService;
  let askService: jasmine.SpyObj<BoardItemAskService>;
  let dialog: { open: jasmine.Spy };

  const closure: AskClosure = { acknowledgedAsks: [{ askId: 1, revision: 1 }], completeAskIds: [], overrideAskIds: [] };
  const staleError = { status: 400, error: { title: ASKS_CHANGED_MESSAGE } };

  function dialogReturning(...results: (AskClosure | undefined)[]): void {
    let call = 0;
    dialog.open.and.callFake(() => ({ afterClosed: () => of(results[Math.min(call++, results.length - 1)]) }));
  }

  beforeEach(() => {
    askService = jasmine.createSpyObj<BoardItemAskService>('BoardItemAskService', ['getForItem']);
    dialog = { open: jasmine.createSpy('open') };

    TestBed.configureTestingModule({
      providers: [
        { provide: BoardItemAskService, useValue: askService },
        { provide: MatDialog, useValue: dialog }
      ]
    });
    service = TestBed.inject(AskCompletionService);
  });

  it('saves without a closure, and without a prompt, when nothing needs review', () => {
    askService.getForItem.and.returnValue(of([makeAsk({ state: AskState.Completed })]));
    const save = jasmine.createSpy('save').and.returnValue(of('saved'));

    let result: unknown;
    service.completeItem(10, 'Release notes', save).subscribe(r => result = r);

    expect(dialog.open).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnceWith(null);
    expect(result).toBe('saved');
  });

  it('prompts when asks need review, and saves with the user\'s closure', () => {
    askService.getForItem.and.returnValue(of([makeAsk({ id: 1, state: AskState.Pending })]));
    dialogReturning(closure);
    const save = jasmine.createSpy('save').and.returnValue(of('saved'));

    service.completeItem(10, 'Release notes', save).subscribe();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open.calls.mostRecent().args[1].data.asks.map((a: { id: number }) => a.id)).toEqual([1]);
    expect(save).toHaveBeenCalledOnceWith(closure);
  });

  it('saves nothing and emits null when the user cancels the prompt', () => {
    askService.getForItem.and.returnValue(of([makeAsk({ state: AskState.Pending })]));
    dialogReturning(undefined);
    const save = jasmine.createSpy('save');

    let result: unknown = 'not emitted';
    service.completeItem(10, 'Release notes', save).subscribe(r => result = r);

    expect(save).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('when the asks changed, reloads them and prompts again with a notice', () => {
    askService.getForItem.and.returnValue(of([makeAsk({ state: AskState.Pending })]));
    dialogReturning(closure, closure);
    const save = jasmine.createSpy('save').and.returnValues(throwError(() => staleError), of('saved'));

    let result: unknown;
    service.completeItem(10, 'Release notes', save).subscribe(r => result = r);

    expect(askService.getForItem).toHaveBeenCalledTimes(2);
    expect(dialog.open).toHaveBeenCalledTimes(2);
    expect(dialog.open.calls.argsFor(0)[1].data.notice).toBeNull();
    expect(dialog.open.calls.argsFor(1)[1].data.notice).toBe(ASKS_CHANGED_MESSAGE);
    expect(result).toBe('saved');
  });

  it('passes any other error on', () => {
    askService.getForItem.and.returnValue(of([]));
    const failure = { status: 400, error: { title: 'The column does not belong to this board.' } };
    const save = jasmine.createSpy('save').and.returnValue(throwError(() => failure));

    let error: unknown;
    service.completeItem(10, 'Release notes', save).subscribe({ error: e => error = e });

    expect(error).toBe(failure);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('gives up after three attempts rather than looping', () => {
    askService.getForItem.and.returnValue(of([]));
    const save = jasmine.createSpy('save').and.returnValue(throwError(() => staleError));

    let error: unknown;
    service.completeItem(10, 'Release notes', save).subscribe({ error: e => error = e });

    expect(save).toHaveBeenCalledTimes(3);
    expect(error).toBe(staleError);
  });
});
