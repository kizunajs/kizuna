import { expect, test } from '@playwright/test';
import { heading, modelContext, openEditor, signIn } from './cms';

test.describe('the editor in a host', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page);
    });

    test('opens on the document the tool read, with a field per schema entry', async ({ page }) => {
        const editor = await openEditor(page, '/team');
        await expect(editor.locator('.k-title-name')).toHaveText('Team');
        await expect(
            editor.locator('.k-section-title', {
                hasText: 'Heading',
            })
        ).toBeVisible();
        await expect(
            editor.locator('.k-section-title', {
                hasText: 'Intro',
            })
        ).toBeVisible();
    });

    test('typing saves the draft and tells the model what changed', async ({ page, browser }) => {
        const editor = await openEditor(page, '/team');
        const wording = `Meet the team ${Date.now() % 100000}`;
        await editor.locator('#field-heading-input').fill(wording);
        await expect(
            editor.getByRole('status').filter({
                hasText: 'Saved',
            })
        ).toBeVisible();
        await expect.poll(async () => (await modelContext(page)).join('\n')).toContain(wording);

        const visitor = await browser.newPage();
        await visitor.goto('/team');
        await expect(heading(visitor)).toHaveText('The people behind the shop');
        await visitor.close();
    });

    test('fullscreen shows the draft, sandboxed, where the host will not frame the site, and pointing at a field focuses it', async ({
        page,
    }) => {
        const editor = await openEditor(page, '/team');
        await expect(editor.locator('iframe[title="Draft preview"]')).toHaveAttribute('sandbox', 'allow-same-origin');
        await expect(editor.locator('.k-stage')).toHaveAttribute('data-ready', 'true');
        const site = editor.frameLocator('iframe[title="Draft preview"]');
        await expect(heading(site)).toBeVisible();
        await heading(site).click();
        await expect(editor.locator('#field-heading .k-field')).toHaveAttribute('data-pointed', 'true');
        await expect.poll(async () => (await modelContext(page)).join('\n')).toContain('pointing at Heading');
    });

    test('browsing the preview follows a link, and the form follows to that page', async ({ page }) => {
        const editor = await openEditor(page, '/');
        await expect(editor.locator('.k-stage')).toHaveAttribute('data-ready', 'true');
        await editor
            .getByRole('radio', {
                name: 'Browse',
            })
            .click();
        const site = editor.frameLocator('iframe[title="Draft preview"]');
        await site
            .getByRole('link', {
                name: 'Team',
            })
            .first()
            .click();
        await expect(editor.locator('.k-title-name')).toHaveText('Team');
        await expect(heading(site)).toContainText(/Meet the team|The people behind the shop/);
    });

    test('a page with no content in the CMS says there is nothing to edit there', async ({ page }) => {
        const editor = await openEditor(page, '/');
        await expect(editor.locator('.k-stage')).toHaveAttribute('data-ready', 'true');
        await editor
            .getByRole('radio', {
                name: 'Browse',
            })
            .click();
        await editor
            .frameLocator('iframe[title="Draft preview"]')
            .getByRole('link', {
                name: 'Edit content',
            })
            .click();
        // `/cms` sends a signed-out visitor to `/login`, which has no content in the CMS.
        await expect(editor.getByText('Nothing to edit on /login')).toBeVisible();
    });

    test('fullscreen frames the live site where the host approves it, and pointing at a field focuses it', async ({ page }) => {
        const editor = await openEditor(page, '/team', {
            framesSite: true,
        });
        await expect(editor.locator('.k-stage')).toHaveAttribute('data-ready', 'true');
        const site = editor.frameLocator('iframe[title="Draft preview"]');
        await expect(heading(site)).toBeVisible();
        await heading(site).click();
        await expect(editor.locator('#field-heading .k-field')).toHaveAttribute('data-pointed', 'true');
        await expect.poll(async () => (await modelContext(page)).join('\n')).toContain('pointing at Heading');
    });

    test('publishing shows each change first, reverts one, and publishes the rest', async ({ page }) => {
        const editor = await openEditor(page, '/team');
        const intro = `The people who pack your orders, ${Date.now() % 1000} of them.`;
        await editor.locator('#field-intro-input').fill(intro);
        await editor.locator('#field-heading-input').fill('A heading to take back');
        await expect(
            editor.getByRole('status').filter({
                hasText: 'Saved',
            })
        ).toBeVisible();
        await editor
            .getByRole('button', {
                name: 'Publish',
            })
            .click();
        const dialog = editor.getByRole('alertdialog');
        await expect(dialog).toContainText('Publish Team?');
        const heading = dialog.locator('.k-review-row', {
            hasText: 'Heading',
        });
        await expect(heading.locator('ins')).toContainText('take back');
        await expect(
            dialog.locator('.k-review-row', {
                hasText: 'Intro',
            })
        ).toBeVisible();

        await heading
            .getByRole('button', {
                name: 'Revert',
            })
            .click();
        await expect(heading).toHaveCount(0);
        await expect(editor.locator('#field-heading-input')).not.toHaveValue('A heading to take back');

        await dialog
            .getByRole('button', {
                name: 'Publish',
                exact: true,
            })
            .click();
        await expect(editor.locator('.k-status')).toHaveText('Published');
    });
});
