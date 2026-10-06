import { expect, hubNegotiated, test } from './support/fixtures';

// A real reminder, end to end: the API schedules it when the event is created, and the backend's
// NotificationBackgroundService sends it over SignalR. That service polls about once a minute
// (hard-coded), so the toast can take up to about 70 s to arrive after its due time.
test('a calendar reminder arrives as a toast that pauses while hovered', async ({ ownerPage: page, api }) => {
  test.setTimeout(180_000);

  // The reminder only reaches a connected client, so connect before scheduling it.
  const connected = hubNegotiated(page);
  await page.goto('/calendar');
  await connected;

  // Starts in 70 s with a 1-minute reminder: due about 10 s from now.
  const start = new Date(Date.now() + 70_000);
  await (await api('owner')).createEvent({
    subject: 'Smoke reminder',
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    reminderMinutes: [1]
  });

  const toast = page.getByRole('alertdialog', { name: 'Event reminder' });
  await expect(toast).toBeVisible({ timeout: 150_000 });
  await expect(toast.locator('.reminder-message')).toContainText('Smoke reminder');

  // Hovering pauses the 12-second auto-dismiss.
  await toast.hover();
  await expect(toast).toHaveClass(/reminder-toast--paused/);
  await page.waitForTimeout(13_000);
  await expect(toast).toBeVisible();

  await toast.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(toast).toBeHidden();
});
