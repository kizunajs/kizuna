import { expect, test } from '@playwright/test';
import { openEditor, signIn } from './cms';

test.beforeEach(async ({ page }) => {
    await signIn(page);
});

test('the front page lists its sections by type, and Add section adds one an editor picks', async ({ page }) => {
    const editor = await openEditor(page, '/');
    await editor
        .getByRole('tab', {
            name: 'Content',
            exact: true,
        })
        .click();
    // The list's own items, not those of the lists inside them.
    const rows = editor.locator('#field-sections .k-array__items').first().locator(':scope > .k-array__item');
    await expect(rows).toHaveCount(7);
    await expect(rows.first().locator('.k-array__tag')).toHaveText('Statement');
    await expect(rows.first().locator('.k-array__title')).toContainText('A small shop in Oslo');

    await editor
        .getByRole('button', {
            name: 'Add section',
        })
        .click();
    const picker = editor.getByRole('dialog', {
        name: 'Add section',
    });
    await expect(picker.getByText('A coloured band that asks the reader to do one thing.')).toBeVisible();
    await picker
        .getByRole('button', {
            name: /^Call to action/,
        })
        .click();
    await expect(picker).toBeHidden();
    await expect(rows).toHaveCount(8);
    const added = rows.last();
    await expect(added.locator('.k-array__tag')).toHaveText('Call to action');
    await added
        .getByRole('textbox', {
            name: 'Heading',
        })
        .fill('Plants for *your office*');
    await expect(
        editor.getByRole('status').filter({
            hasText: 'Saved',
        })
    ).toBeVisible();
    await expect(added.locator('.k-array__title')).toHaveText('Plants for *your office*');

    // Removing it saves the list as it was, so the tests after this one meet the page as seeded.
    await added
        .getByRole('button', {
            name: 'Remove section 8',
        })
        .click();
    await expect(rows).toHaveCount(7);
    await expect(
        editor.getByRole('status').filter({
            hasText: 'Saved',
        })
    ).toBeVisible();
});
