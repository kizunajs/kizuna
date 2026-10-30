import { expect, test, type Page } from '@playwright/test';
import { urls } from '../playwright.config';
import { signIn } from './admin';

const heading = (page: Page) =>
    page.getByRole('heading', {
        level: 1,
    });

test.describe('Hagen Norge in two languages', () => {
    test('opens in Norwegian at its root, and serves English under /en', async ({ page }) => {
        await page.goto(urls.norway);
        await expect(page.locator('html')).toHaveAttribute('lang', 'nb');
        await expect(heading(page)).toHaveText('Planter som blir hos deg');
        await page.goto(`${urls.norway}/en`);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(heading(page)).toHaveText('Plants that stay with you');
        await expect(
            page.getByRole('link', {
                name: 'Shops',
            })
        ).toHaveAttribute('href', '/en/offices');
    });

    test('shows the shared content in each language, with the values every language shares', async ({ page }) => {
        await page.goto(`${urls.norway}/en/privacy`);
        await expect(heading(page)).toHaveText('Privacy policy');
        await expect(page).toHaveTitle('Privacy policy | Hagen Norge');
        await page.goto(`${urls.norway}/en/offices`);
        await expect(page.getByAltText('Close up of fern fronds unfurled in the shade')).toBeVisible();
        await expect(
            page.getByRole('heading', {
                level: 2,
                name: 'Hagen Oslo',
            })
        ).toBeVisible();
    });

    test('sends its first language under a prefix to the root', async ({ page }) => {
        await page.goto(`${urls.norway}/nb/offices`);
        await expect(page).toHaveURL(`${urls.norway}/offices`);
    });
});

test.describe('the UK in English', () => {
    test('serves English at its root', async ({ page }) => {
        await page.goto(`${urls.uk}/en`);
        await expect(page).toHaveURL(`${urls.uk}/`);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
});

test.describe('translating in the admin', () => {
    test('shows one language at a time, with the source beside each translated field', async ({ page }) => {
        await signIn(page, urls.norway, 'ada@hagen.example.com');
        await page.goto(`${urls.norway}/admin/globals/privacyPolicy`);
        const languages = page.getByRole('navigation', {
            name: 'Language',
        });
        await expect(languages.getByRole('link')).toHaveText(['ENPublished', 'NBPublished']);
        await languages
            .getByRole('link', {
                name: /NB/,
            })
            .click();
        await expect(page).toHaveURL(/\/admin\/globals\/privacyPolicy@nb$/);
        await expect(page.getByLabel(/^Heading/)).toHaveValue('Personvern');
        await expect(page.locator('.k-source').first()).toContainText('ENPrivacy policy');
    });
});
