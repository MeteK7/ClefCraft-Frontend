import { AskEventPayload } from '../../_services/notification-realtime.service';
import { askGroupToastText } from './ask-group-toast.component';

describe('askGroupToastText', () => {
  const event = (askId: number, itemTitle: string): AskEventPayload => ({
    askId, boardItemId: askId, boardId: 3, itemTitle, event: 'Requested', actorFullName: 'Rae Requester', note: 'Help',
    reason: null, actedOnBehalf: false, replyId: null, replyExcerpt: null, occurredAt: '2026-10-25T10:00:00Z'
  });

  it('counts the updates and the items they are on, naming the items', () => {
    expect(askGroupToastText([event(1, 'Release notes'), event(2, 'Release notes'), event(3, 'Index')]))
      .toEqual({ icon: 'notifications', headline: '3 updates on 2 items', message: 'Release notes, Index' });
  });

  it('says "1 item" when they are all on one', () => {
    expect(askGroupToastText([event(1, 'Release notes'), event(2, 'Release notes')]).headline).toBe('2 updates on 1 item');
  });

  it('names two items, then how many more', () => {
    expect(askGroupToastText([event(1, 'A'), event(2, 'B'), event(3, 'C'), event(4, 'D')]).message).toBe('A, B and 2 more');
  });
});
