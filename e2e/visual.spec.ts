import { Locator, Page, Response } from '@playwright/test';
import { isEventsRequest, openCalendarAt, settleMonthView } from './support/calendar';
import { expect, test } from './support/fixtures';
import { RunInfo } from './support/run';

// Reference screenshots for the Angular upgrade hops (compare after each hop).
//
// Only "Dana Visual" is used here, by no other spec, so what the sidebar, the board picker, the
// calendar and the toasts show never depends on test order. Every value that changes between runs
// is either fixed (dates in May 2027, UTC, the attendance score) or masked (item id, sync
// indicator, the year in the footer).
//
// Dana has no event types: they can only come from the SQL demo seed (see PLAN.md, "Open
// findings"), so these events show the default event styling. The calendar-dialog baseline will
// change in step 6, when the attendance estimate is removed.

/** A fixed attendance score, so the dialog's "Experimental attendance estimate" always reads the same. */
const FIXED_ATTENDANCE_SCORE = 0.62;

/** The requests each captured view makes when it opens (recorded once, 2026-10-06). */
const VIEW_REQUESTS = {
  calendarEvent: (eventId: number) => [
    `/api/Calendar/${eventId}/attachments`,
    '/api/Calendar/event-types',
    `/api/ActivityLogs/calendar-event/${eventId}`,
    `/api/Calendar/${eventId}/collaborators`,
    `/api/Comments/CalendarEvent/${eventId}`,
    `/api/Comments/CalendarEvent/${eventId}/mentionable-users`
  ],
  board: (boardId: number) => ['/api/Auth/me', '/api/Boards', `/api/BoardItems/GetBoardItemsByBoardId/${boardId}`],
  boardItem: (itemId: number) => [
    '/api/BoardItems/GetTags',
    '/api/BoardItems/GetStatuses',
    '/api/BoardItems/GetPriorities',
    '/api/Boards/{boardId}/Members',
    `/api/Calendar/work-history/${itemId}`,
    `/api/BoardItemRelations/${itemId}`,
    `/api/ActivityLogs/BoardItem/${itemId}`,
    `/api/Comments/BoardItem/${itemId}`,
    `/api/Comments/BoardItem/${itemId}/mentionable-users`
  ]
};

/** Resolves once a successful response has arrived for every path (exact path match, query ignored). */
function responsesFor(page: Page, paths: string[]): Promise<Response[]> {
  return Promise.all(
    paths.map(path => {
      const pattern = new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '\\d+')}$`);
      return page.waitForResponse(r => r.ok() && pattern.test(new URL(r.url()).pathname));
    })
  );
}

/** Overwrites the server's attendance score in every events response with a fixed value. */
async function fixAttendanceScore(page: Page): Promise<void> {
  await page.route(url => isEventsRequest(url.href), async route => {
    try {
      const response = await route.fetch();
      const events: { attendanceScore?: number | null }[] = await response.json();
      for (const event of events) event.attendanceScore = FIXED_ATTENDANCE_SCORE;
      await route.fulfill({ response, json: events });
    } catch {
      // The app cancels superseded range fetches; nothing to fulfill then.
    }
  });
}

async function readyForScreenshot(page: Page): Promise<void> {
  await expect(page.locator('.loading-overlay')).toBeHidden();
  await expect(page.locator('.sync-indicator')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/** Masks for everything that differs between runs on every page. */
const commonMasks = (page: Page): Locator[] => [page.locator('app-footer'), page.locator('.sync-indicator')];

/** No email or username of this run may be visible: they change every run. */
async function expectNoRunIdentifiers(page: Page, run: RunInfo): Promise<void> {
  const text = await page.locator('body').innerText();
  for (const user of Object.values(run.users)) {
    expect(text).not.toContain(user.email);
    expect(text).not.toContain(user.userName);
  }
}

async function switchToDark(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('body')).toHaveClass(/\bdark-theme\b/);
  // Move off the toggle so its tooltip ("Switch to light mode") isn't captured.
  await page.mouse.move(720, 600);
  await expect(page.locator('.cdk-overlay-container').getByText('Switch to light mode')).toHaveCount(0);
}

test('calendar views', async ({ visualPage: page, api, run }) => {
  const dana = await api('visual');
  await dana.createEvent({ subject: 'Team offsite', start: new Date('2027-05-05T00:00:00Z'), end: new Date('2027-05-05T23:59:00Z'), allDay: true });
  const designReview = await dana.createEvent({ subject: 'Design review', start: new Date('2027-05-12T10:00:00Z'), end: new Date('2027-05-12T11:00:00Z'), location: 'Room 2' });
  await dana.createEvent({ subject: 'Release planning', start: new Date('2027-05-13T14:00:00Z'), end: new Date('2027-05-13T15:30:00Z') });
  await dana.createEvent({
    subject: 'Weekly sync',
    start: new Date('2027-05-03T09:00:00Z'),
    end: new Date('2027-05-03T09:30:00Z'),
    recurrence: { frequency: 'WEEKLY', daysOfWeek: [1], count: 4 } // Mondays 3, 10, 17 and 24 May
  });

  await fixAttendanceScore(page);
  // The month view puts the selected week at the top: open on Monday 3 May so the whole month shows.
  const requests = await openCalendarAt(page, '2027-05-03T12:00');
  await settleMonthView(page, requests);
  await expect(page.locator('.span-event', { hasText: 'Design review' })).toBeVisible();
  await expect(page.locator('.span-event', { hasText: 'Team offsite' })).toBeVisible();
  await expect(page.locator('.span-event', { hasText: 'Weekly sync' })).toHaveCount(4);
  await expect(page.locator('.user-info')).toContainText('Dana Visual');
  await expectNoRunIdentifiers(page, run);
  await readyForScreenshot(page);
  await expect(page).toHaveScreenshot('calendar-month-light.png', { mask: commonMasks(page) });

  // The event dialog (General tab).
  const dialogLoaded = responsesFor(page, VIEW_REQUESTS.calendarEvent(designReview.id));
  await page.locator('.span-event', { hasText: 'Design review' }).click();
  await dialogLoaded;
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input[formControlName="subject"]')).toHaveValue('Design review');
  await expect(dialog.locator('.ai-row')).toContainText('62%');
  await readyForScreenshot(page);
  await expect(page).toHaveScreenshot('calendar-dialog-light.png', {
    mask: [...commonMasks(page), dialog.locator('.ai-row .ai-verdict')]
  });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await switchToDark(page);
  await readyForScreenshot(page);
  await expect(page).toHaveScreenshot('calendar-month-dark.png', { mask: commonMasks(page) });
});

test('board views', async ({ visualPage: page, api, run }) => {
  const dana = await api('visual');
  const board = await dana.createBoard('Visual board');
  await dana.addBoardMember(board.id, run.users.collaborator.id);
  await dana.createItem({ boardId: board.id, column: 'Backlog', title: 'Plan the release', status: 'Backlog', priority: 'High' });
  const review = await dana.createItem({ boardId: board.id, column: 'In Progress', title: 'Review the API', status: 'In Progress', priority: 'Medium' });
  await dana.assignItem(review, run.users.collaborator.id);
  await dana.createItem({ boardId: board.id, column: 'Done', title: 'Ship v1', status: 'Done', priority: 'Low' });

  const boardLoaded = responsesFor(page, VIEW_REQUESTS.board(board.id));
  await page.goto(`/board?boardId=${board.id}`);
  await boardLoaded;
  await expect(page.locator('app-board-item')).toHaveCount(3);
  const assigned = page.locator('app-board-item', { hasText: 'Review the API' });
  await expect(assigned.locator('.avatar')).toHaveText('BC'); // initials from the fixed display name
  await expectNoRunIdentifiers(page, run);
  await readyForScreenshot(page);
  await expect(page).toHaveScreenshot('board-light.png', { mask: commonMasks(page) });

  // The item-detail dialog (Details tab).
  const dialogLoaded = responsesFor(page, VIEW_REQUESTS.boardItem(review.id));
  await assigned.click();
  await dialogLoaded;
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('h2.dialog-title')).toContainText('Item Details');
  await expect(dialog.locator('input[formControlName="title"]')).toHaveValue('Review the API');
  // The item's own status and priority, not the first options (the dialog used to fall back to those).
  await expect(dialog.locator('mat-select[formControlName="statusId"]')).toContainText('In Progress');
  await expect(dialog.locator('mat-select[formControlName="priorityId"]')).toContainText('Medium');
  await readyForScreenshot(page);
  await expect(page).toHaveScreenshot('item-dialog-light.png', {
    mask: [...commonMasks(page), dialog.locator('.item-id-badge')]
  });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toBeHidden();

  await switchToDark(page);
  await readyForScreenshot(page);
  await expect(page).toHaveScreenshot('board-dark.png', { mask: commonMasks(page) });
});
