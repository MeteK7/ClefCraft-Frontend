import { boardWithItems, expect, hubNegotiated, test } from './support/fixtures';

test('an @mention in a board comment reaches the mentioned user as a toast', async ({
  ownerPage,
  collaboratorPage,
  api,
  run
}) => {
  const { owner: ada, collaborator: ben } = run.users;

  // The mention list only offers board members, and the app has no UI for adding one.
  const ownerApi = await api('owner');
  const { boardId, itemIds } = await boardWithItems(ownerApi, 'Mention board', [{ title: 'Mention target' }]);
  const itemId = itemIds['Mention target'];
  await ownerApi.addBoardMember(boardId, ben.id);

  // The mentioned user must be connected to the hub before the comment is posted.
  const benConnected = hubNegotiated(collaboratorPage);
  await collaboratorPage.goto('/board');
  await benConnected;

  // Ada opens the item and writes a comment that mentions Ben.
  const mentionable = ownerPage.waitForResponse(r =>
    r.url().endsWith(`/api/Comments/BoardItem/${itemId}/mentionable-users`) && r.ok()
  );
  await ownerPage.goto(`/board?boardId=${boardId}&openItemId=${itemId}`);
  const dialog = ownerPage.getByRole('dialog');
  await expect(dialog.locator('h2.dialog-title')).toContainText('Item Details');
  const mentionableUsers: { fullName: string }[] = await (await mentionable).json();
  expect(mentionableUsers.map(u => u.fullName)).toContain(ben.fullName);

  await dialog.getByRole('tab', { name: /Comments/ }).click();
  const composer = dialog.locator('.new-comment-row .comment-composer');
  await composer.click();
  const editor = composer.locator('.ql-editor');
  await expect(editor).toBeFocused();

  await ownerPage.keyboard.type('Please review ');
  await ownerPage.keyboard.type('@Ben');
  await ownerPage.locator('.ql-mention-list-item', { hasText: ben.fullName }).click();
  await expect(editor.locator('.mention')).toContainText(ben.fullName);

  const posted = ownerPage.waitForResponse(r => r.url().endsWith('/api/Comments') && r.request().method() === 'POST');
  await composer.getByRole('button', { name: 'Comment' }).click();
  const postedResponse = await posted;
  expect(postedResponse.status()).toBe(200);
  const commentId: number = (await postedResponse.json()).id;

  const comment = dialog.locator(`#comment-${commentId}`);
  await expect(comment.locator('.comment-html')).toContainText('Please review');
  await expect(comment.locator('.comment-html .mention')).toContainText(`@${ben.fullName}`);

  // Ben gets the live toast and can jump straight to the comment.
  const toast = collaboratorPage.getByRole('alertdialog', { name: 'Comment mention' });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(toast).toContainText(`${ada.fullName} mentioned you`);
  // Exact text: the excerpt is plain text, so no markup, HTML entities or invisible characters.
  await expect(toast.locator('.reminder-message')).toHaveText(`Please review @${ben.fullName}`);

  await toast.getByRole('button', { name: /View comment/ }).click();
  const benDialog = collaboratorPage.getByRole('dialog');
  await expect(benDialog.locator('h2.dialog-title')).toContainText('Item Details');
  await expect(benDialog.locator(`#comment-${commentId}`)).toHaveClass(/comment-highlighted/);
});
