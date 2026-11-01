import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Where `@kizunajs/mcp` puts the tool call on a handler's args. A registry
 * symbol, so the CMS reads it without depending on that package.
 */
const MCP_CALL = Symbol.for('kizuna.mcp.call');

/**
 * What a write over MCP is credited to when the client never said its name.
 */
export const UNNAMED_AGENT = 'an agent';

interface McpCall {
    client?: {
        name: string;
        title?: string;
    };
}

/**
 * The agent that made a call, as people read it, like `Claude`, or `null` for
 * a person in the admin. The client's `title`, else its `name`, else
 * {@link UNNAMED_AGENT}.
 */
export const agentOf = (args: object): string | null => {
    const call = (args as { [MCP_CALL]?: McpCall })[MCP_CALL];
    if (call === undefined) return null;
    return call.client?.title ?? call.client?.name ?? UNNAMED_AGENT;
};

const acting = new AsyncLocalStorage<string | null>();

/**
 * Runs an editing handler as the agent that called it, so every write it
 * makes records the agent beside the person.
 */
export const withAgent = <Result>(agent: string | null, run: () => Promise<Result>): Promise<Result> => acting.run(agent, run);

/**
 * The agent the current call acts through, or `null` outside one.
 */
export const actingAgent = (): string | null => acting.getStore() ?? null;
