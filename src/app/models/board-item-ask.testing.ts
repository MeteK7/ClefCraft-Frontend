import { AskState, BoardItemAsk } from './board-item-ask.model';

/** An ask as the API would return it, for specs; isOpen and isUnmetRequirement follow the state. */
export function makeAsk(overrides: Partial<BoardItemAsk> = {}): BoardItemAsk {
  const state = overrides.state ?? AskState.Pending;
  return {
    id: 1,
    boardItemId: 10,
    boardItemTitle: 'Release notes',
    boardId: 3,
    requestedByUserId: 'requester',
    requestedByFullName: 'Rae Requester',
    recipientUserId: 'recipient',
    recipientFullName: 'Ayse Recipient',
    recipientIsBoardMember: true,
    note: 'Review the migration',
    dueDate: null,
    isRequired: false,
    expectsAnswer: false,
    isAnswered: false,
    state,
    responseNote: null,
    respondedAt: null,
    completedAt: null,
    completedByUserId: null,
    completedByFullName: null,
    cancelReason: null,
    dateCreated: '2026-10-10T09:00:00Z',
    lastNudgedAt: null,
    nextNudgeAt: null,
    revision: 1,
    isOpen: state === AskState.Pending || state === AskState.Accepted,
    isUnmetRequirement: !!overrides.isRequired && state !== AskState.Completed,
    allowedActions: [],
    canReply: false,
    replies: [],
    answerReplyId: null,
    ...overrides
  };
}
