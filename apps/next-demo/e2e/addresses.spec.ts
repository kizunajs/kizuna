import { expect, test, type Page } from '@playwright/test';

const addressOf = (page: Page): string => {
    const url = new URL(page.url());
    return `${url.pathname}${url.search}`;
};

/**
 * Opens `address` signed out, signs in as the demo's admin, and waits to land
 * back on it.
 */
const signInAt = async (page: Page, address: string): Promise<void> => {
    await page.goto(address);
    await page.waitForURL((url) => url.pathname === '/admin/login');
    await page.getByLabel('Email').fill('dev@kizunajs.com');
    await page.getByLabel('Password').fill('password1234');
    await page
        .getByRole('button', {
            name: 'Sign in',
        })
        .click();
    await page.waitForURL((url) => `${url.pathname}${url.search}` === address);
};

const title = (page: Page) =>
    page.getByRole('heading', {
        level: 1,
    });

const sidebarLink = (page: Page, name: string) =>
    page
        .getByRole('navigation', {
            name: 'Admin',
        })
        .getByRole('link', {
            name,
            exact: true,
        });

test.describe("the admin's addresses", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({
            width: 1440,
            height: 900,
        });
    });

    test('lands a signed-out editor on the screen they opened, and stays there on reload', async ({ page }) => {
        await signInAt(page, '/admin/collections/employees?sort=title');
        await expect(title(page)).toHaveText('Employees');
        await page.reload();
        expect(addressOf(page)).toBe('/admin/collections/employees?sort=title');
        await expect(title(page)).toHaveText('Employees');
    });

    test('moves between screens without loading the page again, and back and forward', async ({ page }) => {
        await signInAt(page, '/admin');
        await page.evaluate(() => {
            (window as unknown as Record<string, unknown>)['stillLoaded'] = true;
        });
        await sidebarLink(page, 'Employees').click();
        await page.waitForURL((url) => url.pathname === '/admin/collections/employees');
        await expect(title(page)).toHaveText('Employees');
        await page.locator('.k-list-results tbody tr a').first().click();
        await page.waitForURL((url) => /^\/admin\/collections\/employees\/[^/]+$/.test(url.pathname));
        const item = addressOf(page);
        await sidebarLink(page, 'Header').click();
        await page.waitForURL((url) => url.pathname === '/admin/globals/header');
        await expect(title(page)).toHaveText('Header');
        expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['stillLoaded'])).toBe(true);

        await page.goBack();
        expect(addressOf(page)).toBe(item);
        await page.goBack();
        await expect(title(page)).toHaveText('Employees');
        expect(addressOf(page)).toBe('/admin/collections/employees');
        await page.goForward();
        expect(addressOf(page)).toBe(item);
        await page.reload();
        expect(addressOf(page)).toBe(item);
    });

    test('opens a screen in a tab of its own on a ⌘-click, leaving this one where it is', async ({ page, context }) => {
        await signInAt(page, '/admin');
        const opened = context.waitForEvent('page');
        await sidebarLink(page, 'Employees').click({
            modifiers: ['ControlOrMeta'],
        });
        const tab = await opened;
        await tab.waitForURL((url) => url.pathname === '/admin/collections/employees');
        await expect(title(tab)).toHaveText('Employees');
        expect(addressOf(page)).toBe('/admin');
    });

    test("keeps a list's sort and search in the query", async ({ page }) => {
        await signInAt(page, '/admin/collections/employees');
        await page
            .getByRole('button', {
                name: 'Sort',
            })
            .click();
        await page
            .getByRole('menuitemradio', {
                name: 'Title',
            })
            .click();
        await page.waitForURL((url) => url.searchParams.get('sort') === '-title');
        await page.getByRole('searchbox').fill('ingrid');
        await page.waitForURL((url) => url.searchParams.get('search') === 'ingrid');
        await page.reload();
        await expect(page.getByRole('searchbox')).toHaveValue('ingrid');
        expect(new URL(page.url()).searchParams.get('sort')).toBe('-title');
        await sidebarLink(page, 'Employees').click();
        await page.waitForURL((url) => url.search === '');
        await expect(page.getByRole('searchbox')).toHaveValue('');
    });

    test('moves a link of the old hash form to its path', async ({ page }) => {
        await signInAt(page, '/admin');
        // From a blank tab, so the link loads the admin as a bookmark would.
        await page.goto('about:blank');
        await page.goto('/admin#/collections/employees');
        await expect(title(page)).toHaveText('Employees');
        expect(new URL(page.url()).hash).toBe('');
        expect(addressOf(page)).toBe('/admin/collections/employees');
    });

    test('says when an address under the admin names no screen', async ({ page }) => {
        await signInAt(page, '/admin/nothing-here');
        await expect(title(page)).toHaveText('Not found');
    });

    test('signs out, and back in to the screen opened next', async ({ page }) => {
        await signInAt(page, '/admin/globals/header');
        await page.locator('.k-sidebar__account').click();
        await page
            .getByRole('menuitem', {
                name: 'Sign out',
            })
            .click();
        await page.waitForURL((url) => url.pathname === '/admin/login');
        await signInAt(page, '/admin/collections/employees?page=1');
        await expect(title(page)).toHaveText('Employees');
    });
});
