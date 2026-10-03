import { expect, test } from '@playwright/test';
import { openEditor, signIn } from './cms';

test.describe('items shown on a page', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page);
    });

    test('clicking an item on a page opens it, and goes back to the page', async ({ page }) => {
        const editor = await openEditor(page, '/team');
        await expect(editor.locator('.k-stage')).toHaveAttribute('data-ready', 'true');
        const site = editor.frameLocator('iframe[title="Draft preview"]');
        await site.getByText('Ingrid Solberg').first().click();
        await expect(editor.locator('.k-title-name')).toHaveText('Ingrid Solberg');

        await editor
            .getByRole('button', {
                name: 'Back to Team',
            })
            .click();
        await expect(editor.locator('.k-title-name')).toHaveText('Team');
        await expect(editor.locator('.k-back')).toBeHidden();
    });

    test('the switcher opens any page, global or item, and adds an item', async ({ page }) => {
        const editor = await openEditor(page, '/team');
        await editor
            .getByRole('button', {
                name: /open another page or item/,
            })
            .click();
        await expect(
            editor.locator('.k-switcher-heading', {
                hasText: 'Pages',
            })
        ).toBeVisible();
        await expect(
            editor.locator('.k-switcher-heading', {
                hasText: 'On every page',
            })
        ).toBeVisible();
        await editor.getByPlaceholder('Find a page or item').fill('aiko');
        await editor
            .locator('.k-switcher-row', {
                hasText: 'Aiko Tanaka',
            })
            .click();
        await expect(editor.locator('.k-title-name')).toHaveText('Aiko Tanaka');

        await editor
            .getByRole('button', {
                name: /open another page or item/,
            })
            .click();
        await editor
            .locator('.k-switcher-heading-row', {
                hasText: 'Employees',
            })
            .getByRole('button', {
                name: 'New',
            })
            .click();
        await expect(editor.locator('.k-title-name')).toHaveText('Untitled');
    });
});
