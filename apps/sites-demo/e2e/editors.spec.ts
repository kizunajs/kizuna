import { expect, test, type Page } from '@playwright/test';
import { urls } from '../playwright.config';

/**
 * Signs in through the admin's sign-in screen on one site.
 */
const signIn = async (page: Page, url: string, email: string): Promise<void> => {
    await page.goto(`${url}/admin/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('kizuna-demo');
    await page
        .getByRole('button', {
            name: 'Sign in',
        })
        .click();
    await page.waitForURL((address) => address.pathname.startsWith('/admin') && address.pathname !== '/admin/login');
};

const editors = [
    {
        email: 'ada@hagen.example.com',
        url: urls.group,
    },
    {
        email: 'una@hagen.example.com',
        url: urls.uk,
    },
    {
        email: 'sam@hagen.example.com',
        url: urls.uk,
    },
    {
        email: 'nils@hagen.example.com',
        url: urls.norway,
    },
    {
        email: 'kari@hagen.example.com',
        url: urls.norway,
    },
];

test.describe('the editors', () => {
    for (const editor of editors) {
        test(`${editor.email} signs in on their site`, async ({ page }) => {
            await signIn(page, editor.url, editor.email);
            await expect(
                page.getByRole('navigation', {
                    name: 'Admin',
                })
            ).toBeVisible();
        });
    }

    // TODO(sites): with `auth.sites`, Sam sees the UK and the shared content in the site switcher, and never Norway.
});
