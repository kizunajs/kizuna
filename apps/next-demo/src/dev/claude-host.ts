import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * A stand-in for Claude's MCP Apps host, for debugging the CMS editor in a
 * browser: the editor runs on another origin under the policy Claude's
 * sandbox applies, and tool calls go to the CMS's MCP endpoint as the
 * signed-in editor.
 */

/**
 * The other name for this machine, so the editor runs on an origin of its
 * own, as it does in Claude.
 */
export const otherOrigin = (origin: string): string => {
    const url = new URL(origin);
    url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    return url.origin;
};

/**
 * The policy Claude's sandbox applies to a view: what the view declares for
 * scripts, styles, images and fetches, and frames from nowhere but itself.
 * `framesSite` lets the site in, as a host that honours `frameDomains` does.
 */
export const sandboxPolicy = (declared: ViewCsp, framesSite: boolean): string => {
    const resources = (declared.resourceDomains ?? []).join(' ');
    const connect = (declared.connectDomains ?? []).join(' ');
    const frames = framesSite ? ` ${(declared.frameDomains ?? []).join(' ')}` : '';
    return [
        "default-src 'none'",
        `script-src 'self' 'unsafe-inline' ${resources}`,
        `style-src 'self' 'unsafe-inline' ${resources}`,
        `img-src 'self' data: blob: ${resources}`,
        `font-src 'self' data: ${resources}`,
        `connect-src 'self' ${connect}`,
        `frame-src 'self' blob: data:${frames}`,
        `base-uri 'self' ${(declared.baseUriDomains ?? []).join(' ')}`,
    ].join('; ');
};

/**
 * What the editor's resource declares under `_meta.ui.csp`.
 */
export interface ViewCsp {
    connectDomains?: string[];
    baseUriDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
}

/**
 * The origins the CMS's editor declares, read from the MCP endpoint as a host
 * reads them.
 */
export const declaredCsp = async (site: string, cookie: string): Promise<ViewCsp> => {
    const response = await fetch(new URL('/cms-api/mcp', site), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            cookie,
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'resources/list',
        }),
    });
    const text = await response.text();
    const data = text.split('\n').find((line) => line.startsWith('data: '));
    const result = JSON.parse(data === undefined ? text : data.slice(6)) as {
        result?: { resources?: Array<{ uri: string; _meta?: { ui?: { csp?: ViewCsp } } }> };
    };
    return result.result?.resources?.find((resource) => resource.uri === 'ui://kizuna-cms/document')?._meta?.ui?.csp ?? {};
};

/**
 * The editor as the CMS serves it over MCP, told where the site is.
 */
export const editorPage = async (site: string): Promise<string> => {
    const entry = createRequire(join(process.cwd(), 'package.json')).resolve('@kizunajs/cms');
    const html = await readFile(join(dirname(entry), 'views/document.html'), 'utf8');
    return html.replace(
        '"__KIZUNA_CMS_VIEW_CONFIG__"',
        JSON.stringify({
            siteUrl: site,
        })
    );
};

export interface HostPageOptions {
    /**
     * Where the editor is served from, on the other origin.
     */
    viewUrl: string;
    /**
     * The site's origin, which the host says it approves framing when
     * `framesSite` is on.
     */
    site: string;
    framesSite: boolean;
    /**
     * The tool call that opens the editor, as the model would make it.
     */
    opening: {
        name: string;
        arguments: Record<string, unknown>;
    };
}

/**
 * The host page: frames the editor, answers the MCP Apps handshake, sends the
 * opening tool's result, relays tool calls to `/cms-api/mcp`, and keeps what
 * the editor tells the model in `window.modelContext`, shown below the frame.
 */
export const hostPage = (options: HostPageOptions): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Claude host for the CMS editor</title>
<style>
body { margin: 0; background: #262624; color: #c2c0b6; font: 13px ui-sans-serif, system-ui, sans-serif; }
#view { display: block; width: 100%; height: 640px; border: 0; }
#context { margin: 0; padding: 12px 16px; white-space: pre-wrap; }
</style>
</head>
<body>
<iframe id="view" src="${options.viewUrl}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
<pre id="context">The model has been told nothing yet.</pre>
<script>
const frame = document.getElementById('view');
const host = {
    displayMode: 'inline',
};
window.modelContext = [];
const send = (message) => frame.contentWindow.postMessage(message, '*');
const callTool = async (params) => {
    const response = await fetch('/cms-api/mcp', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
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
                    name: 'claude-host',
                    version: '1.0.0',
                },
                hostCapabilities: {
                    serverTools: {},
                    openLinks: {},
                    updateModelContext: {
                        text: {},
                    },
                    ${
                        options.framesSite
                            ? `sandbox: {
                        csp: {
                            frameDomains: ${JSON.stringify([options.site])},
                        },
                    },`
                            : ''
                    }
                },
                hostContext: {
                    platform: 'desktop',
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
                params: await callTool(${JSON.stringify(options.opening)}),
            });
            return;
        case 'tools/call':
            reply(await callTool(message.params));
            return;
        case 'ui/update-model-context':
            window.modelContext.push(message.params.content.map((block) => block.text).join('\\n'));
            document.getElementById('context').textContent = window.modelContext.at(-1);
            reply({});
            return;
        case 'ui/open-link':
            window.open(message.params.url, '_blank');
            reply({});
            return;
        case 'ui/request-display-mode':
            host.displayMode = message.params.mode;
            frame.style.height = host.displayMode === 'fullscreen' ? '100vh' : '640px';
            reply({
                mode: host.displayMode,
            });
            send({
                jsonrpc: '2.0',
                method: 'ui/notifications/host-context-changed',
                params: {
                    displayMode: host.displayMode,
                },
            });
            return;
        default:
            if (message.id !== undefined) reply({});
    }
});
</script>
</body>
</html>
`;
