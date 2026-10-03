import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type FrameLocator, type Page } from '@playwright/test';

/**
 * Signs in as the demo editor through the login form, and returns the session
 * token `/cms` shows for connecting an MCP host.
 */
export const signIn = async (page: Page): Promise<string> => {
    await page.goto('/login?next=/cms');
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

// Playwright loads the specs as CommonJS.
const VIEW = join(__dirname, '../../../packages/cms/dist/views/document.html');

/**
 * What the fake host does, in the page that frames the editor: the MCP Apps
 * handshake, the opening tool result, and every tool call relayed to the CMS's
 * MCP endpoint with the editor's token. What the editor tells the model lands
 * in `window.modelContext`.
 */
const hostScript = (token: string, opening: { name: string; arguments: Record<string, unknown> }) => `
const frame = document.getElementById('view');
const host = {
    displayMode: 'inline',
};
window.modelContext = [];
const send = (message) => frame.contentWindow.postMessage(message, '*');
const callTool = async (params) => {
    const response = await fetch('/cms-api/mcp', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            authorization: 'Bearer ${token}',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params,
        }),
    });
    const text = await response.text();
    const data = text.split('\\n').find((line) => line.startsWith('data: '));
    return JSON.parse(data === undefined ? text : data.slice(6)).result;
};
window.addEventListener('message', async (event) => {
    if (event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message?.jsonrpc !== '2.0') return;
    const reply = (result) =>
        send({
            jsonrpc: '2.0',
            id: message.id,
            result,
        });
    switch (message.method) {
        case 'ui/initialize':
            reply({
                protocolVersion: message.params.protocolVersion,
                hostInfo: {
                    name: 'e2e host',
                    version: '1.0.0',
                },
                hostCapabilities: {
                    serverTools: {},
                    openLinks: {},
                    updateModelContext: {
                        text: {},
                    },
                },
                hostContext: {
                    theme: 'dark',
                    displayMode: host.displayMode,
                    availableDisplayModes: ['inline', 'fullscreen'],
                },
            });
            return;
        case 'ui/notifications/initialized':
            send({
                jsonrpc: '2.0',
                method: 'ui/notifications/tool-result',
                params: await callTool(${JSON.stringify(opening)}),
            });
            return;
        case 'tools/call':
            reply(await callTool(message.params));
            return;
        case 'ui/update-model-context':
            window.modelContext.push(message.params.content.map((block) => block.text).join('\\n'));
            reply({});
            return;
        case 'ui/request-display-mode':
            host.displayMode = message.params.mode;
            frame.style.height = host.displayMode === 'fullscreen' ? '100vh' : '640px';
            reply({
                mode: host.displayMode,
            });
            return;
        default:
            if (message.id !== undefined) reply({});
    }
});
`;

/**
 * Opens the editor the way a host does after a tool call, framed in a page on
 * the site's own origin so the draft preview inside it keeps its cookies.
 */
export const openEditor = async (
    page: Page,
    token: string,
    opening: { name: string; arguments: Record<string, unknown> }
): Promise<FrameLocator> => {
    const origin = new URL(page.url()).origin;
    const view = (await readFile(VIEW, 'utf8')).replace(
        '"__KIZUNA_CMS_VIEW_CONFIG__"',
        JSON.stringify({
            siteUrl: origin,
        })
    );
    await page.route(`${origin}/__e2e/view`, (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: view,
        })
    );
    await page.route(`${origin}/__e2e/host`, (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><body style="margin:0;background:#0c0c0c"><iframe id="view" src="/__e2e/view" style="width:100%;height:640px;border:0"></iframe><script>${hostScript(token, opening)}</script></body>`,
        })
    );
    await page.setViewportSize({
        width: 1440,
        height: 900,
    });
    await page.goto(`${origin}/__e2e/host`);
    const editor = page.frameLocator('#view');
    await expect(editor.locator('.k-title-name')).toBeVisible();
    return editor;
};

/**
 * What the editor has told the model so far.
 */
export const modelContext = (page: Page): Promise<string[]> =>
    page.evaluate(() => (window as unknown as { modelContext: string[] }).modelContext);
