import { expect, test } from '@playwright/test';
import { heading, openPreview, outline, segment, signIn, toolbar } from './cms';

test('a visitor reads the published team page without the overlay', async ({ page }) => {
    await page.goto('/team');
    await expect(heading(page)).toHaveText('The people behind the shop');
    await expect(page.getByText('Ingrid Solberg')).toBeVisible();
    await expect(page.getByText('Kizuna demo shop.')).toBeVisible();
    await expect(toolbar(page)).toHaveCount(0);
});

test.describe('signed in', () => {
    test.beforeEach(async ({ page }) => {
        await signIn(page);
    });

    test('the preview opens in Browse, where the page behaves as it does for a visitor', async ({ page }) => {
        await openPreview(page, '/team');
        await expect(segment(page, 'Browse')).toHaveAttribute('aria-pressed', 'true');
        await heading(page).hover();
        await expect(outline(page, 'Heading')).toHaveCount(0);
        await heading(page).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('Edit is remembered for the tab across pages and reloads', async ({ page }) => {
        await openPreview(page, '/team');
        await segment(page, 'Edit').click();
        await page.goto('/contact');
        await expect(segment(page, 'Edit')).toHaveAttribute('aria-pressed', 'true');
        await page.reload();
        await expect(segment(page, 'Edit')).toHaveAttribute('aria-pressed', 'true');
    });

    test('Edit outlines a field and opens it, and the draft shows after autosave', async ({ page, browser }) => {
        await openPreview(page, '/team');
        await segment(page, 'Edit').click();
        await heading(page).hover();
        await expect(outline(page, 'Heading')).toBeVisible();
        await heading(page).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Heading', { exact: true })).toBeVisible();
        const wording = `Meet the team ${Date.now() % 100000}`;
        await dialog.locator('input').first().fill(wording);
        await expect(heading(page)).toContainText(wording);

        const visitor = await browser.newPage();
        await visitor.goto('/team');
        await expect(heading(visitor)).toHaveText('The people behind the shop');
        await visitor.close();
    });

    test('Edit leaves links that are not fields working', async ({ page }) => {
        await openPreview(page, '/');
        await segment(page, 'Edit').click();
        await page
            .getByRole('navigation')
            .getByRole('link', {
                name: 'Team',
            })
            .click();
        await page.waitForURL((url) => url.pathname === '/team');
        await expect(heading(page)).toBeVisible();
    });

    test('an article opens at its address, and edits as the collection item it is', async ({ page }) => {
        await openPreview(page, '/blog/spring-sale');
        await segment(page, 'Edit').click();
        await heading(page).hover();
        await expect(outline(page, 'Title')).toBeVisible();
        await heading(page).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Title', { exact: true })).toBeVisible();
        await expect(dialog.locator('input').first()).toHaveValue('Spring sale starts Monday');
        const wording = `Spring sale ${Date.now() % 100000}`;
        await dialog.locator('input').first().fill(wording);
        await expect(heading(page)).toContainText(wording);
    });

    test('an article body edits as rich text, and the page shows what was typed', async ({ page }) => {
        await openPreview(page, '/blog/plants-for-dark-offices');
        await segment(page, 'Edit').click();
        const paragraph = page.locator('main p').filter({
            hasText: /Ferns, snake plants/,
        });
        await paragraph.hover();
        await expect(outline(page, 'Body')).toBeVisible();
        await paragraph.click();
        const dialog = page.getByRole('dialog');
        await expect(
            dialog.getByRole('button', {
                name: 'Bold',
            })
        ).toBeVisible();
        const editable = dialog.locator('[contenteditable="true"]');
        await editable.getByText(/Ferns, snake plants/).click();
        await page.keyboard.press('End');
        const addition = ` Turn them every ${Date.now() % 1000} days.`;
        await page.keyboard.type(addition);
        await expect(paragraph).toContainText(addition.trim());
    });

    test('an employee opens from the team page as its own item', async ({ page }) => {
        await openPreview(page, '/team');
        await segment(page, 'Edit').click();
        // Draft content carries invisible source markers after the text, so match its start.
        await page.getByText(/^Aiko Tanaka/).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Name', { exact: true })).toBeVisible();
        await expect(dialog.locator('input').first()).toHaveValue('Aiko Tanaka');
    });

    test('signed out with draft mode still on, nothing is outlined or taken over', async ({ page, context }) => {
        await openPreview(page, '/team');
        await segment(page, 'Edit').click();
        await context.clearCookies({
            name: /session_token/,
        });
        await page.reload();
        await expect(toolbar(page).getByText('Signed out')).toBeVisible();
        await heading(page).hover();
        await expect(outline(page, 'Heading')).toHaveCount(0);
        await heading(page).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });
});
