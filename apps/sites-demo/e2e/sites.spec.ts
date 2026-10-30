import { expect, test, type Page } from '@playwright/test';
import { urls } from '../playwright.config';

const heading = (page: Page) =>
    page.getByRole('heading', {
        level: 1,
    });

test.describe('each site', () => {
    test('shows its own front page, named and iconed after the site', async ({ page }) => {
        const expected = [
            {
                url: urls.group,
                label: 'Hagen Group',
                icon: '/icons/group.svg',
                heading: 'Three plant shops, one family',
                company: 'Hagen Group AS',
            },
            {
                url: urls.uk,
                label: 'Hagen UK',
                icon: '/icons/uk.svg',
                heading: 'Plants that stay with you, on Columbia Road',
                company: 'Hagen UK Ltd',
            },
            {
                url: urls.norway,
                label: 'Hagen Norge',
                icon: '/icons/norway.svg',
                heading: 'Planter som blir hos deg',
                company: 'Hagen Norge AS',
            },
        ];
        for (const site of expected) {
            await page.goto(site.url);
            await expect(heading(page)).toHaveText(site.heading);
            await expect(page).toHaveTitle(site.label);
            await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', site.icon);
            await expect(page.getByRole('contentinfo')).toContainText(site.company);
        }
    });

    test('names its pages after the site in the tab', async ({ page }) => {
        await page.goto(`${urls.uk}/offices`);
        await expect(page).toHaveTitle('Shops | Hagen UK');
        await page.goto(`${urls.norway}/privacy`);
        await expect(page).toHaveTitle('Personvern | Hagen Norge');
    });

    test('says its language', async ({ page }) => {
        await page.goto(urls.norway);
        await expect(page.locator('html')).toHaveAttribute('lang', 'nb');
        await page.goto(urls.uk);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
});

test.describe('the shared content', () => {
    test('shows the same offices on every site', async ({ page }) => {
        for (const url of Object.values(urls)) {
            await page.goto(`${url}/offices`);
            for (const office of ['Hagen London', 'Hagen Oslo', 'Hagen Bergen']) {
                await expect(
                    page.getByRole('heading', {
                        level: 2,
                        name: office,
                    })
                ).toBeVisible();
            }
        }
    });

    test('shows one privacy policy on every site, in the language it opens in', async ({ page }) => {
        for (const url of [urls.group, urls.uk]) {
            await page.goto(`${url}/privacy`);
            await expect(heading(page)).toHaveText('Privacy policy');
            await expect(page.getByText('Write to privacy@hagen.example.com')).toBeVisible();
        }
        await page.goto(`${urls.norway}/privacy`);
        await expect(heading(page)).toHaveText('Personvern');
        await expect(page.getByText('Skriv til privacy@hagen.example.com')).toBeVisible();
    });
});

/**
 * The London shop as a site's shops page shows it.
 */
const london = (page: Page) =>
    page.locator('section').filter({
        has: page.getByRole('heading', {
            level: 2,
            name: 'Hagen London',
        }),
    });

test.describe("a site's own values on shared content", () => {
    test("show the UK's own number for London on the UK", async ({ page }) => {
        await page.goto(`${urls.uk}/offices`);
        await expect(
            london(page).getByRole('link', {
                name: '+44 20 7946 0321',
            })
        ).toBeVisible();
    });

    test('leave the shared number on the sites that set none', async ({ page }) => {
        for (const url of [urls.norway, urls.group]) {
            await page.goto(`${url}/offices`);
            await expect(
                london(page).getByRole('link', {
                    name: '+47 22 41 08 00',
                })
            ).toBeVisible();
            await expect(london(page)).not.toContainText('+44 20 7946 0321');
        }
    });

    test('show opening hours on the UK alone', async ({ page }) => {
        await page.goto(`${urls.uk}/offices`);
        await expect(london(page)).toContainText('Tuesday to Sunday, 9 to 17');
        for (const url of [urls.norway, urls.group]) {
            await page.goto(`${url}/offices`);
            await expect(london(page)).not.toContainText('Tuesday to Sunday');
        }
    });
});

test.describe('the images', () => {
    test("show the shared Oslo photo on every site, and the UK's own on its event", async ({ page }) => {
        for (const url of [urls.group, urls.uk]) {
            await page.goto(`${url}/offices`);
            await expect(page.getByAltText('Close up of fern fronds unfurled in the shade')).toBeVisible();
        }
        await page.goto(`${urls.norway}/offices`);
        await expect(page.getByAltText('Nærbilde av bregneblader som har foldet seg ut i skyggen')).toBeVisible();
        await page.goto(`${urls.uk}/events`);
        const image = page.getByAltText('Tall spruce trunks above a green understorey');
        await expect(image).toBeVisible();
        await expect(image).toHaveJSProperty('complete', true);
        expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    });
});

test.describe("the UK's events", () => {
    test('list on the UK, in date order', async ({ page }) => {
        await page.goto(`${urls.uk}/events`);
        await expect(heading(page)).toHaveText('Workshops at the London shop');
        await expect(
            page.getByRole('heading', {
                level: 2,
            })
        ).toHaveText(['Repotting without the mess', 'Houseplants through the winter', 'Wreath evening']);
    });

    test('are not on Norway', async ({ page }) => {
        await page.goto(urls.norway);
        await expect(
            page.getByRole('link', {
                name: 'Events',
            })
        ).toHaveCount(0);
        const response = await page.goto(`${urls.norway}/events`);
        expect(response?.status()).toBe(404);
    });
});
