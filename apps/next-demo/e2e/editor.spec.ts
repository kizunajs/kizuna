import { expect, test } from '@playwright/test';
import { heading, modelContext, openEditor, signIn } from './cms';

const describeTeam = {
    name: 'editing_describe',
    arguments: {
        query: {
            url: '/team',
        },
    },
};

test.describe('the editor in a host', () => {
    let token: string;

    test.beforeEach(async ({ page }) => {
        token = await signIn(page);
    });

    test('opens on the document the tool read, with a field per schema entry', async ({ page }) => {
        const editor = await openEditor(page, token, describeTeam);
        await expect(editor.locator('.k-title-name')).toHaveText('Team page');
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
        const editor = await openEditor(page, token, describeTeam);
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

    test('fullscreen frames the draft, and pointing at a field focuses it and tells the model', async ({ page }) => {
        const editor = await openEditor(page, token, describeTeam);
        await editor
            .getByRole('button', {
                name: 'Open preview',
            })
            .click();
        await expect(editor.locator('.k-stage')).toHaveAttribute('data-ready', 'true');
        const site = editor.frameLocator('iframe[title="Draft preview"]');
        await expect(heading(site)).toBeVisible();
        await heading(site).click();
        await expect(editor.locator('#field-heading')).toHaveAttribute('data-pointed', 'true');
        await expect.poll(async () => (await modelContext(page)).join('\n')).toContain('pointing at Heading');
    });

    test('publishing asks in the editor, then publishes', async ({ page }) => {
        const editor = await openEditor(page, token, describeTeam);
        await editor.locator('#field-intro-input').fill(`The people who pack your orders, ${Date.now() % 1000} of them.`);
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
        await expect(dialog).toContainText('Publish Team page?');
        await dialog
            .getByRole('button', {
                name: 'Publish',
            })
            .click();
        await expect(editor.locator('.k-status')).toHaveText('Published');
    });
});
