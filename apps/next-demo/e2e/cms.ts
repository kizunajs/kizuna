import { expect, type Page } from '@playwright/test';

/**
 * Signs in as the demo editor through the login form.
 */
export const signIn = async (page: Page): Promise<void> => {
    await page.goto('/login?next=/cms');
    await page.getByPlaceholder('Password').fill('kizuna-demo');
    await page
        .getByRole('button', {
            name: 'Sign in',
        })
        .click();
    await page.waitForURL((url) => url.pathname === '/cms');
};

/**
 * Enters draft mode the way the overview's preview links do: a token from
 * the API, handed to the draft route.
 */
export const openPreview = async (page: Page, path: string): Promise<void> => {
    const minted = await page.request.post('/cms-api/preview');
    expect(minted.status()).toBe(201);
    const { token } = (await minted.json()) as { token: string };
    await page.goto(`/api/draft?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(path)}`);
    await page.waitForURL((url) => url.pathname === path);
    await expect(toolbar(page)).toBeVisible();
};

export const toolbar = (page: Page) =>
    page.getByRole('toolbar', {
        name: 'Preview',
    });

export const segment = (page: Page, name: 'Edit' | 'Browse') =>
    toolbar(page).getByRole('button', {
        name,
        exact: true,
    });

/**
 * The outline the overlay draws around a field under the pointer.
 */
export const outline = (page: Page, label: string) =>
    page.locator('[data-kizuna-cms-overlay] [aria-hidden="true"]').filter({
        hasText: new RegExp(`^${label}$`),
    });

export const heading = (page: Page) =>
    page.getByRole('heading', {
        level: 1,
    });
