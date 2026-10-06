import { Locator, Page } from '@playwright/test';
import { ApiClient, CalendarEventDto } from './support/api';
import { dragBy, dragTo, expect, test } from './support/fixtures';

// All calendar data lives in March 2027, which doesn't contain "today": no today marker or
// now-line, and the owner (a fresh user every run) starts with an empty calendar. The browser
// runs in UTC and the API events are created in UTC, so times read the same everywhere.

const MARCH_START = new Date('2027-03-01T00:00:00Z');
const MARCH_END = new Date('2027-04-05T00:00:00Z');
const utc = (isoWithoutZone: string) => new Date(`${isoWithoutZone}Z`);

/** Opens the month view on 10 March 2027 and waits until its events are loaded. */
async function openMarch(page: Page): Promise<void> {
  const loaded = page.waitForResponse(r => r.url().includes('/api/Calendar/events') && r.ok());
  await page.goto('/calendar?date=2027-03-10T12:00');
  await loaded;
  await expect(page.locator('.loading-overlay')).toBeHidden();
}

/** The month view's week row that starts on the given Monday (yyyyMMdd). */
const weekRow = (page: Page, monday: string) => page.locator('.calendar-week', { has: page.locator(`#day-${monday}-0`) });

/** An event bar in a week row. */
const monthEvent = (page: Page, monday: string, subject: string | RegExp) =>
  weekRow(page, monday).locator('.span-event', { has: page.locator('.event-title', { hasText: subject }) });

/** The weekday column a month-view event bar starts in: 1 = Monday ... 7 = Sunday. */
const startColumn = (bar: Locator) => () => bar.evaluate(el => getComputedStyle(el).gridColumnStart);

const exactly = (text: string) => new RegExp(`^\\s*${text}\\s*$`);

async function marchEvents(api: ApiClient, subject: string): Promise<CalendarEventDto[]> {
  return (await api.getEvents(MARCH_START, MARCH_END)).filter(e => e.subject === subject);
}

test('creating an event from the month view saves it on the clicked day', async ({ ownerPage: page, api }) => {
  await openMarch(page);

  await page.locator('#day-20270308-2').click(); // Wednesday 10 March
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[formControlName="subject"]').fill('Smoke create');

  const created = page.waitForResponse(r => r.url().endsWith('/api/Calendar') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: /Save/ }).click();
  expect((await created).status()).toBe(200);
  await expect(dialog).toBeHidden();

  await expect.poll(startColumn(monthEvent(page, '20270308', 'Smoke create'))).toBe('3'); // Wednesday

  const saved = await marchEvents(await api('owner'), 'Smoke create');
  expect(saved).toHaveLength(1);
  expect(saved[0].startDate.slice(0, 10)).toBe('2027-03-10');
});

test('dragging an event to another day in the month view moves it', async ({ ownerPage: page, api }) => {
  const owner = await api('owner');
  await owner.createEvent({ subject: 'Smoke move', start: utc('2027-03-11T14:00:00'), end: utc('2027-03-11T15:00:00') });
  await openMarch(page);

  const event = monthEvent(page, '20270308', 'Smoke move');
  await expect.poll(startColumn(event)).toBe('4'); // Thursday

  const updated = page.waitForResponse(r => /\/api\/Calendar\/\d+$/.test(r.url()) && r.request().method() === 'PUT');
  await dragTo(page, event, page.locator('#day-20270308-4')); // Friday 12 March
  expect((await updated).status()).toBe(200);

  await expect.poll(startColumn(monthEvent(page, '20270308', 'Smoke move'))).toBe('5'); // Friday

  const [moved] = await marchEvents(owner, 'Smoke move');
  expect(new Date(moved.startDate).toISOString()).toBe('2027-03-12T14:00:00.000Z');
  expect(new Date(moved.endDate).toISOString()).toBe('2027-03-12T15:00:00.000Z');
});

test('dragging and resizing an event in the week view changes its times', async ({ ownerPage: page, api }) => {
  const owner = await api('owner');
  await owner.createEvent({ subject: 'Smoke resize', start: utc('2027-03-10T10:00:00'), end: utc('2027-03-10T11:00:00') });
  await openMarch(page);

  const weekLoaded = page.waitForResponse(r => r.url().includes('/api/Calendar/events') && r.ok());
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await weekLoaded;

  const block = page.locator('.time-block-event', { has: page.locator('.time-block-title', { hasText: 'Smoke resize' }) });
  await expect(block.locator('.time-block-time')).toHaveText('10:00 – 11:00');

  const times = async () => {
    const [event] = await marchEvents(owner, 'Smoke resize');
    return `${new Date(event.startDate).toISOString()} ${new Date(event.endDate).toISOString()}`;
  };

  // Move down one hour (80 px per hour).
  let saved = page.waitForResponse(r => /\/api\/Calendar\/\d+$/.test(r.url()) && r.request().method() === 'PUT');
  await dragBy(page, block.locator('.time-block-title'), 0, 80);
  expect((await saved).status()).toBe(200);
  await expect(block.locator('.time-block-time')).toHaveText('11:00 – 12:00');
  await expect.poll(times).toBe('2027-03-10T11:00:00.000Z 2027-03-10T12:00:00.000Z');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Stretch the end by half an hour (40 px).
  saved = page.waitForResponse(r => /\/api\/Calendar\/\d+$/.test(r.url()) && r.request().method() === 'PUT');
  await dragBy(page, block.locator('.resize-handle.bottom'), 0, 40);
  expect((await saved).status()).toBe(200);
  await expect(block.locator('.time-block-time')).toHaveText('11:00 – 12:30');
  await expect.poll(times).toBe('2027-03-10T11:00:00.000Z 2027-03-10T12:30:00.000Z');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('editing one occurrence of a recurring event changes only that occurrence', async ({ ownerPage: page, api }) => {
  const owner = await api('owner');
  await owner.createEvent({
    subject: 'Smoke standup',
    start: utc('2027-03-01T09:00:00'),
    end: utc('2027-03-01T09:30:00'),
    recurrence: { frequency: 'WEEKLY', daysOfWeek: [1], count: 4 } // Mondays 1, 8, 15 and 22 March
  });
  await openMarch(page);

  await monthEvent(page, '20270315', exactly('Smoke standup')).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[formControlName="subject"]').fill('Smoke standup moved');
  await dialog.getByRole('button', { name: /Save/ }).click();

  const scopeDialog = page.getByRole('dialog').filter({ hasText: 'Edit Recurring Event' });
  await expect(scopeDialog.getByRole('radio', { name: /Only this occurrence/ })).toBeChecked();
  const saved = page.waitForResponse(r => r.url().endsWith('/api/Calendar/occurrence') && r.request().method() === 'PUT');
  await scopeDialog.getByRole('button', { name: 'Apply' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(monthEvent(page, '20270315', exactly('Smoke standup moved'))).toBeVisible();
  for (const monday of ['20270301', '20270308', '20270322']) {
    await expect(monthEvent(page, monday, exactly('Smoke standup'))).toBeVisible();
  }

  const subjectsByDate = Object.fromEntries(
    (await owner.getEvents(MARCH_START, MARCH_END))
      .filter(e => e.subject.startsWith('Smoke standup'))
      .map(e => [new Date(e.startDate).toISOString().slice(0, 10), e.subject])
  );
  expect(subjectsByDate).toEqual({
    '2027-03-01': 'Smoke standup',
    '2027-03-08': 'Smoke standup',
    '2027-03-15': 'Smoke standup moved',
    '2027-03-22': 'Smoke standup'
  });
});
