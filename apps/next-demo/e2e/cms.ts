import { expect, type FrameLocator, type Page } from '@playwright/test';

/**
 * Signs in through the login form, as the demo editor unless told otherwise,
 * and returns the session token `/cms` shows for connecting an MCP host.
 */
export const signIn = async (page: Page, email = 'editor@example.com'): Promise<string> => {
    await page.goto('/login?next=/cms');
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password').fill('kizuna-demo');
    await page
        .getByRole('button', {
            name: 'Sign in',
        })
        .click();
    await page.waitForURL((url) => url.pathname === '/cms');
    const command = await page.locator('pre').innerText();
    const token = /Bearer ([^"\s]+)/.exec(command)?.[1];
    if (token === undefined) throw new Error('/cms showed no session token.');
    return token;
};

export const heading = (page: Page | FrameLocator) =>
    page.getByRole('heading', {
        level: 1,
    });

/**
 * The bar a draft preview shows in a tab of its own.
 */
export const previewBar = (page: Page) =>
    page.getByRole('status').filter({
        hasText: /Draft preview/,
    });

/**
 * Opens the editor on a page through `/dev/claude`, the demo's stand-in for
 * Claude: the editor on an origin of its own, under the policy Claude's
 * sandbox applies, with tool calls made as the signed-in editor.
 */
export const openEditor = async (
    page: Page,
    path: string,
    options: {
        /**
         * Approve framing the site, as a host that honours `frameDomains`
         * does. Left out, the host blocks it, as Claude does.
         */
        framesSite?: boolean;
    } = {}
): Promise<FrameLocator> => {
    await page.setViewportSize({
        width: 1440,
        height: 900,
    });
    await page.goto(`/dev/claude?url=${encodeURIComponent(path)}${options.framesSite === true ? '&frames=1' : ''}`);
    const editor = page.frameLocator('#view');
    await expect(editor.locator('.k-title-name')).toBeVisible();
    return editor;
};

/**
 * What the editor has told the model so far.
 */
export const modelContext = (page: Page): Promise<string[]> =>
    page.evaluate(() => (window as unknown as { modelContext: string[] }).modelContext);
