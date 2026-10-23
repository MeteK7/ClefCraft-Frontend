import { AskEventPayload } from '../../_services/notification-realtime.service';
import { askToastText } from './ask-toast.component';

describe('askToastText', () => {
  const event = (overrides: Partial<AskEventPayload>): AskEventPayload => ({
    askId: 7, boardItemId: 1, boardId: 3, itemTitle: 'Implement RAG pipeline', event: 'Requested',
    actorFullName: 'Rae Requester', note: 'Share the dummy-data SQL', reason: null, actedOnBehalf: false,
    replyId: null, replyExcerpt: null, ...overrides
  });

  it('says who asked, and what', () => {
    expect(askToastText(event({}))).toEqual(jasmine.objectContaining({
      headline: 'Rae Requester asked you to help', message: 'Share the dummy-data SQL'
    }));
  });

  it('shows the reply itself for a reply, and for a done ask sent with its answer', () => {
    expect(askToastText(event({ event: 'Replied', actorFullName: 'Ayse Recipient', replyExcerpt: 'INSERT INTO items' })))
      .toEqual(jasmine.objectContaining({ headline: 'Ayse Recipient replied', message: 'INSERT INTO items' }));
    expect(askToastText(event({ event: 'Completed', actorFullName: 'Ayse Recipient', replyExcerpt: 'Done, see the SQL' })))
      .toEqual(jasmine.objectContaining({ headline: 'Ayse Recipient marked your ask done', message: 'Done, see the SQL' }));
  });

  it('falls back to the request when there is no reply or reason', () => {
    expect(askToastText(event({ event: 'Completed' })).message).toBe('Share the dummy-data SQL');
    expect(askToastText(event({ event: 'Declined' })).message).toBe('Share the dummy-data SQL');
    expect(askToastText(event({ event: 'Declined', reason: 'Out this week' })).message).toBe('Out this week');
  });

  it('says why an ask closed without anyone withdrawing it', () => {
    expect(askToastText(event({ event: 'Cancelled', reason: 'ItemCompleted' })).headline)
      .toBe('An ask was closed when the item was completed');
    expect(askToastText(event({ event: 'Cancelled', reason: 'Withdrawn' })).headline)
      .toBe('Rae Requester withdrew their ask');
  });

  it('names a nudge', () => {
    expect(askToastText(event({ event: 'Nudged' })).headline).toBe('Rae Requester nudged you');
  });
});
