import { expect, test, type Page } from '@playwright/test';
import { urls } from '../playwright.config';
import { signIn } from './admin';

const titles = (page: Page) =>
    page.getByRole('heading', {
        level: 2,
    });

const showsOn = (page: Page) =>
    page.getByRole('group', {
        name: 'Shows on',
    });

test.describe('the journal', () => {
    test('lists on each site only the articles shown there, newest first', async ({ page }) => {
        await page.goto(`${urls.uk}/journal`);
        await expect(titles(page)).toHaveText(['Winter care for houseplants', 'Columbia Road flower market']);
        await page.goto(`${urls.norway}/journal`);
        await expect(titles(page)).toHaveText(['Juletrær i Oslo', 'Vinterstell av stueplanter']);
    });

    test('lists every article on the group, since each shows there', async ({ page }) => {
        await page.goto(`${urls.group}/journal`);
        await expect(titles(page)).toHaveText([
            'Juletrær i Oslo',
            'Winter care for houseplants',
            'Columbia Road flower market',
            'Visiting the growers we buy from',
        ]);
    });
});

test.describe('Shows on in the admin', () => {
    test('offers an admin over every site each site, and the list names them', async ({ page }) => {
        await signIn(page, urls.group, 'ada@hagen.example.com');
        await page.goto(`${urls.group}/admin/collections/articles`);
        const market = page.getByRole('row').filter({
            hasText: 'Columbia Road flower market',
        });
        await expect(market).toContainText('Hagen Group, Hagen UK');
        await market
            .getByRole('link', {
                name: 'Columbia Road flower market',
            })
            .click();
        await expect(showsOn(page).getByRole('button')).toHaveText(['Hagen Group', 'Hagen UK', 'Hagen Norge']);
        await expect(
            showsOn(page).getByRole('button', {
                name: 'Hagen UK',
            })
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
            showsOn(page).getByRole('button', {
                name: 'Hagen Norge',
            })
        ).toHaveAttribute('aria-pressed', 'false');
    });

    test("offers a site's editor only their own site, to propose for review", async ({ page }) => {
        await signIn(page, urls.uk, 'sam@hagen.example.com');
        await page.goto(`${urls.uk}/admin/uk/collections/articles`);
        await page
            .getByRole('link', {
                name: 'Juletrær i Oslo',
            })
            .click();
        await expect(showsOn(page).getByRole('button')).toHaveText(['Hagen UK']);
        await expect(
            page.getByRole('button', {
                name: 'Publish',
            })
        ).toHaveCount(0);
    });
});
