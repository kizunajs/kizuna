import type { Page } from '@playwright/test';

/**
 * Signs in through the admin's sign-in screen on one site, with the seed's
 * password unless told otherwise.
 */
export const signIn = async (page: Page, url: string, email: string, password = 'kizuna-demo'): Promise<void> => {
    await page.goto(`${url}/admin/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page
        .getByRole('button', {
            name: 'Sign in',
        })
        .click();
    await page.waitForURL((address) => address.pathname.startsWith('/admin') && address.pathname !== '/admin/login');
};

/**
 * The admin's sidebar.
 */
export const adminNav = (page: Page) =>
    page.getByRole('navigation', {
        name: 'Admin',
    });

/**
 * The keys of the sites the admin lists for the signed-in editor, read from
 * the config it renders into the page.
 */
export const adminSites = async (page: Page, url: string): Promise<string[]> => {
    const html = await (await page.request.get(`${url}/admin`)).text();
    const found = /<script id="kizuna-cms-config" type="application\/json">(.*?)<\/script>/s.exec(html);
    if (found === null) throw new Error(`${url}/admin rendered no config.`);
    const config = JSON.parse(found[1]!) as {
        sites?: Array<{
            key: string;
        }>;
    };
    return (config.sites ?? []).map((site) => site.key);
};

/**
 * The places at the top of the sidebar: the overview of every site for an
 * admin over them all, the editor's sites, and Shared.
 */
export const places = (page: Page) => adminNav(page).locator('.k-places a');
