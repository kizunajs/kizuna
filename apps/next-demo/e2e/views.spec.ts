import { expect, test, type Page } from '@playwright/test';

/**
 * Signs in to the admin as the demo's admin, who may open App users.
 */
const signInToAdmin = async (page: Page): Promise<void> => {
    await page.goto('/admin/login?next=/admin');
    await page.getByLabel('Email').fill('dev@kizunajs.com');
    await page.getByLabel('Password').fill('password1234');
    await page
        .getByRole('button', {
            name: 'Sign in',
        })
        .click();
    await page.waitForURL((url) => url.pathname === '/admin');
};

const titles = (page: Page) => page.locator('.k-list-results tbody tr').locator('a').allInnerTexts();

test.describe('a view that filters and sorts on the server', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({
            width: 1440,
            height: 900,
        });
        await signInToAdmin(page);
    });

    test("heads App users' columns with their labels and shows when each signed up as a date", async ({ page }) => {
        await page.goto('/admin/views/appUsers');
        await expect(
            page.getByRole('link', {
                name: 'Edda Editor',
            })
        ).toBeVisible();
        await expect(
            page.getByRole('columnheader', {
                name: 'Signed up',
            })
        ).toBeVisible();
        await expect(
            page
                .getByRole('cell', {
                    name: /^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/,
                })
                .first()
        ).toBeVisible();
        await expect(
            page.getByRole('cell', {
                name: /\d{4}-\d{2}-\d{2}T/,
            })
        ).toHaveCount(0);
        await expect(
            page
                .getByRole('cell', {
                    name: 'Admin',
                    exact: true,
                })
                .first()
        ).toBeVisible();
    });

    test('filters App users by role and sorts them by name or sign-up date', async ({ page }) => {
        await page.goto('/admin/views/appUsers');
        await expect(
            page.getByRole('link', {
                name: 'Edda Editor',
            })
        ).toBeVisible();

        const asked: URL[] = [];
        page.on('request', (request) => {
            const url = new URL(request.url());
            if (url.pathname.endsWith('/editing/views/appUsers/items')) asked.push(url);
        });

        await page
            .getByRole('button', {
                name: 'Filters',
            })
            .click();
        await page
            .getByRole('combobox', {
                name: 'Value',
            })
            .click();
        await page
            .getByRole('option', {
                name: 'Admin',
            })
            .click();
        await expect(
            page.getByRole('link', {
                name: 'Edda Editor',
            })
        ).toBeHidden();
        await expect.poll(() => titles(page).then((shown) => [...shown].sort())).toEqual(['Ada Admin', 'Kizuna Dev']);
        expect(asked.some((url) => url.searchParams.getAll('filter').includes('role:is:admin'))).toBe(true);
        // The header still counts every app user, as a collection's does.
        await expect(page.getByText('5 app users')).toBeVisible();

        await page
            .getByRole('button', {
                name: 'Sort',
            })
            .click();
        await page
            .getByRole('menuitemradio', {
                name: 'Name',
            })
            .click();
        await expect.poll(() => titles(page)).toEqual(['Ada Admin', 'Kizuna Dev']);
        // The rows may already sit in this order, so wait for the request rather than the rows.
        await expect.poll(() => asked.some((url) => url.searchParams.get('orderBy') === 'name')).toBe(true);

        await page
            .getByRole('button', {
                name: 'Sort',
            })
            .click();
        await page
            .getByRole('menuitemradio', {
                name: 'Signed up',
            })
            .click();
        await expect.poll(() => titles(page)).toEqual(['Kizuna Dev', 'Ada Admin']);
        await expect.poll(() => asked.some((url) => url.searchParams.get('orderBy') === 'signedUpAt')).toBe(true);
    });
});
