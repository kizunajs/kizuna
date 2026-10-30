import { expect, test, type Page } from '@playwright/test';
import { urls } from '../playwright.partner.config';
import { signIn } from '../e2e/admin';

/**
 * The token the demo's stand-in authorization server issued the travel agency.
 */
const READ_TOKEN = 'demo-travel-agency-read-token';

/**
 * The London shop as the travel agency's day trips page shows it.
 */
const londonOnThePartner = (page: Page) =>
    page.getByRole('listitem').filter({
        has: page.getByRole('heading', {
            level: 2,
            name: 'Hagen London',
        }),
    });

/**
 * The London shop's id, as the signed-in editor lists the shared offices.
 */
const londonId = async (page: Page): Promise<string> => {
    const response = await page.request.get(`${urls.uk}/api/editing/collections/offices/items`);
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

test("the travel agency lists Hagen UK's offices, with the UK's own phone number", async ({ page }) => {
    await page.goto(urls.partner);
    for (const office of ['Hagen London', 'Hagen Oslo', 'Hagen Bergen']) {
        await expect(
            page.getByRole('heading', {
                level: 2,
                name: office,
            })
        ).toBeVisible();
    }
    await expect(londonOnThePartner(page)).toContainText('+44 20 7946');
});

test("the travel agency's token reading Norway answers 403", async ({ request }) => {
    const response = await request.get(`${urls.uk}/api/content/sites/norway/collections/offices`, {
        headers: {
            authorization: `Bearer ${READ_TOKEN}`,
        },
    });
    expect(response.status()).toBe(403);
    expect(((await response.json()) as { detail: string }).detail).toContain('content.sites.norway:read');
});

test("publishing a UK office's phone shows the new number on the travel agency", async ({ page }) => {
    await page.goto(urls.partner);
    await expect(londonOnThePartner(page)).toContainText('+44 20 7946');

    const phone = `+44 20 7946 ${String(Date.now()).slice(-4)}`;
    await signIn(page, urls.uk, 'sam@hagen.example.com');
    const path = `/sites/uk/collections/offices/items/${await londonId(page)}`;
    const saved = await page.request.patch(`${urls.uk}/api/editing${path}/draft`, {
        headers: {
            origin: urls.uk,
        },
        data: {
            changes: {
                phone,
            },
        },
    });
    expect(saved.status()).toBe(200);
    const published = await page.request.post(`${urls.uk}/api/editing${path}/publish`, {
        headers: {
            origin: urls.uk,
        },
        data: {},
    });
    expect(published.status()).toBe(200);

    await expect(async () => {
        await page.goto(urls.partner);
        await expect(londonOnThePartner(page)).toContainText(phone, {
            timeout: 1_000,
        });
    }).toPass();
});
