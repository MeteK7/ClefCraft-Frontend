import { boardWithItems, dragTo, expect, test } from './support/fixtures';

test('dragging a card to another column moves it and survives a reload', async ({ ownerPage: page, api }) => {
  const owner = await api('owner');
  const { boardId, itemIds } = await boardWithItems(owner, 'Smoke board', [
    { title: 'Smoke card A' },
    { title: 'Smoke card B' }
  ]);

  const backlog = page.locator('[id="column-Backlog"]');
  const inProgress = page.locator('[id="column-In Progress"]');
  const card = (title: string) => page.locator('app-board-item').filter({ has: page.locator('h4', { hasText: title }) });

  const columnsLoaded = page.waitForResponse(r => r.url().includes(`/api/BoardItems/GetBoardItemsByBoardId/${boardId}`) && r.ok());
  await page.goto(`/board?boardId=${boardId}`);
  await columnsLoaded;
  await expect(backlog.locator('app-board-item')).toHaveCount(2);

  const switched = page.waitForResponse(r => r.url().endsWith('/api/BoardItems/SwitchColumn'));
  await dragTo(page, backlog.locator(card('Smoke card A')), inProgress);
  expect((await switched).status()).toBe(200);

  await expect(inProgress.locator(card('Smoke card A'))).toBeVisible();
  await expect(backlog.locator(card('Smoke card A'))).toHaveCount(0);
  await expect(backlog.locator(card('Smoke card B'))).toBeVisible();

  // Persisted: after a reload, and in the API.
  await page.reload();
  await expect(inProgress.locator(card('Smoke card A'))).toBeVisible();
  await expect(backlog.locator(card('Smoke card B'))).toBeVisible();

  const columns = await owner.getColumns(boardId);
  const columnOf = (itemId: number) => columns.find(c => (c.boardItems ?? []).some(i => i.id === itemId))?.title;
  expect(columnOf(itemIds['Smoke card A'])).toBe('In Progress');
  expect(columnOf(itemIds['Smoke card B'])).toBe('Backlog');
});
