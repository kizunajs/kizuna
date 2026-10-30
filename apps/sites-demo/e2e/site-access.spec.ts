import { expect, test, type Page } from '@playwright/test';
import { urls } from '../playwright.config';
import { adminSites, signIn, siteChoices } from './admin';

/**
 * The London shop's id, as the signed-in editor lists the shared offices.
 */
const londonId = async (page: Page, url: string): Promise<string> => {
    const response = await page.request.get(`${url}/api/editing/collections/offices/items`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
        items: Array<{
            id: string;
            label: string;
        }>;
    };
    const found = body.items.find((item) => item.label === 'Hagen London');
    if (found === undefined) throw new Error('The offices list has no Hagen London.');
    return found.id;
};

/**
 * Saves changes to the draft an editing path names, then asks to publish it,
 * and answers the publish's status.
 */
const saveAndPublish = async (page: Page, path: string, changes: Record<string, unknown>): Promise<number> => {
    const saved = await page.request.patch(`${urls.uk}/api/editing${path}/draft`, {
        headers: {
            origin: urls.uk,
        },
        data: {
            changes,
        },
    });
    expect(saved.status()).toBe(200);
    const published = await page.request.post(`${urls.uk}/api/editing${path}/publish`, {
        headers: {
            origin: urls.uk,
        },
        data: {},
    });
    return published.status();
};

/**
 * The London shop as the UK's shops page shows it.
 */
const londonOnTheUk = async (page: Page) => {
    await page.goto(`${urls.uk}/offices`);
    return page.locator('section').filter({
        has: page.getByRole('heading', {
            level: 2,
            name: 'Hagen London',
        }),
    });
};

test.describe("a UK editor's sites", () => {
    test('are Hagen UK and Shared alone', async ({ page }) => {
        await signIn(page, urls.uk, 'sam@hagen.example.com');
        await expect(await siteChoices(page)).toHaveText(['Hagen UK', 'Shared']);
        expect(await adminSites(page, urls.uk)).toEqual(['uk']);
    });

    test("never reach Norway's admin addresses or content", async ({ page }) => {
        await signIn(page, urls.uk, 'sam@hagen.example.com');
        const id = await londonId(page, urls.uk);
        expect((await page.request.get(`${urls.uk}/admin/uk/collections/offices/${id}`)).status()).toBe(200);
        expect((await page.request.get(`${urls.uk}/admin/norway/collections/offices/${id}`)).status()).toBe(404);
        expect((await page.request.get(`${urls.uk}/api/editing/sites/norway/pages/frontPage/draft`)).status()).toBe(404);
        expect((await page.request.get(`${urls.uk}/api/editing/sites/norway/collections/offices/items/${id}/draft`)).status()).toBe(404);
    });

    test("publish the UK's own phone number", async ({ page }) => {
        await signIn(page, urls.uk, 'sam@hagen.example.com');
        const id = await londonId(page, urls.uk);
        const ukValues = `/sites/uk/collections/offices/items/${id}`;
        expect(
            await saveAndPublish(page, ukValues, {
                phone: '+44 20 7946 0322',
            })
        ).toBe(200);
        await expect(await londonOnTheUk(page)).toContainText('+44 20 7946 0322');
        expect(
            await saveAndPublish(page, ukValues, {
                phone: '+44 20 7946 0321',
            })
        ).toBe(200);
        await expect(await londonOnTheUk(page)).toContainText('+44 20 7946 0321');
    });

    test('draft a shared office, and never publish it', async ({ page }) => {
        await signIn(page, urls.uk, 'sam@hagen.example.com');
        const id = await londonId(page, urls.uk);
        expect(
            await saveAndPublish(page, `/collections/offices/items/${id}`, {
                address: '14 Columbia Road, London E2 7RG',
            })
        ).toBe(403);
    });
});

test.describe("a Norway editor's sites", () => {
    test('are Hagen Norge alone', async ({ page }) => {
        await signIn(page, urls.norway, 'kari@hagen.example.com');
        await expect(await siteChoices(page)).toHaveText(['Hagen Norge', 'Shared']);
        expect(await adminSites(page, urls.norway)).toEqual(['norway']);
        const id = await londonId(page, urls.norway);
        expect((await page.request.get(`${urls.norway}/admin/uk/collections/offices/${id}`)).status()).toBe(404);
        expect((await page.request.get(`${urls.norway}/api/editing/sites/uk/collections/events/items`)).status()).toBe(404);
    });
});

test.describe('an admin over every site', () => {
    for (const admin of [
        {
            email: 'ada@hagen.example.com',
            password: 'kizuna-demo',
        },
        {
            email: 'dev@kizunajs.com',
            password: 'password1234',
        },
    ]) {
        test(`${admin.email} sees every site`, async ({ page }) => {
            await signIn(page, urls.group, admin.email, admin.password);
            await expect(await siteChoices(page)).toHaveText(['Hagen Group', 'Hagen UK', 'Hagen Norge', 'Shared']);
            expect(await adminSites(page, urls.group)).toEqual(['group', 'uk', 'norway']);
        });
    }
});
