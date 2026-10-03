import { expect, test } from '@playwright/test';
import { heading, previewBar, signIn } from './cms';

test('a visitor reads the published team page without the preview', async ({ page }) => {
    await page.goto('/team');
    await expect(heading(page)).toHaveText('The people behind the shop');
    await expect(page.getByText('Ingrid Solberg')).toBeVisible();
    await expect(previewBar(page)).toHaveCount(0);
});

test('a signed-in editor opens draft mode in a tab, sees the bar, and leaves', async ({ page }) => {
    await signIn(page);
    await page.goto(`/cms-api/draft?redirect=${encodeURIComponent('/team')}`);
    await page.waitForURL((url) => url.pathname === '/team');
    await expect(previewBar(page)).toBeVisible();
    await previewBar(page)
        .getByRole('link', {
            name: 'Exit',
        })
        .click();
    await page.waitForURL((url) => url.pathname === '/team');
    await expect(previewBar(page)).toHaveCount(0);
});

test('a link the editor minted opens draft mode with no sign-in', async ({ page, browser }) => {
    const token = await signIn(page);
    const minted = await page.request.post('/cms-api/editing/preview', {
        headers: {
            authorization: `Bearer ${token}`,
        },
        data: {
            path: '/contact',
        },
    });
    expect(minted.status()).toBe(200);
    const { url } = (await minted.json()) as { url: string };

    const stranger = await browser.newPage();
    await stranger.goto(url);
    await stranger.waitForURL((current) => current.pathname === '/contact');
    await expect(previewBar(stranger)).toBeVisible();
    await stranger.close();
});
