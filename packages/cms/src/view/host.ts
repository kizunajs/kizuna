import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps';

type ToolResult = Parameters<NonNullable<App['ontoolresult']>>[0];

/**
 * What the host has sent, kept from before the editor renders, since the
 * tool result can arrive the moment the connection opens.
 */
export interface HostEvents {
    toolResult: () => ToolResult | undefined;
    onToolResult: (listener: (result: ToolResult) => void) => () => void;
    onContextChanged: (listener: (changes: McpUiHostContext) => void) => () => void;
}

export const listenToHost = (app: App): HostEvents => {
    let latest: ToolResult | undefined;
    const resultListeners = new Set<(result: ToolResult) => void>();
    const contextListeners = new Set<(changes: McpUiHostContext) => void>();
    app.ontoolresult = (result) => {
        latest = result;
        for (const listener of resultListeners) listener(result);
    };
    app.onhostcontextchanged = (changes) => {
        for (const listener of contextListeners) listener(changes);
    };
    return {
        toolResult: () => latest,
        onToolResult: (listener) => {
            resultListeners.add(listener);
            return () => resultListeners.delete(listener);
        },
        onContextChanged: (listener) => {
            contextListeners.add(listener);
            return () => contextListeners.delete(listener);
        },
    };
};
