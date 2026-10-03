import type { App } from '@modelcontextprotocol/ext-apps';
import { parseRef, type DocumentRef } from '../refs.js';

/**
 * A route's answer as its tool returns it.
 */
export interface ToolAnswer<Body = unknown> {
    status: number;
    body: Body;
}

/**
 * The `_meta` the editor sends with a call the person already confirmed in
 * it, so the route runs without asking again. `@kizunajs/mcp` reads it, and a
 * model cannot set it, since it only writes a call's arguments.
 */
const APPROVED_META = {
    'io.kizunajs/approved': true,
};

/**
 * Calls one of the CMS's tools through the host, as the person in the chat.
 */
export interface Connection {
    call: <Body = unknown>(name: string, input?: Record<string, unknown>, options?: { approved?: boolean }) => Promise<ToolAnswer<Body>>;
}

/**
 * The `{ status, body }` envelope every kizuna tool answers with, from its
 * structured content or, for an error, its text.
 */
const answerOf = (result: { structuredContent?: unknown; content?: unknown; isError?: boolean }): ToolAnswer => {
    if (typeof result.structuredContent === 'object' && result.structuredContent !== null && 'status' in result.structuredContent) {
        return result.structuredContent as ToolAnswer;
    }
    const text = Array.isArray(result.content)
        ? (result.content as Array<{ type?: string; text?: string }>).find((block) => block.type === 'text')?.text
        : undefined;
    try {
        const parsed = JSON.parse(text ?? '') as Partial<ToolAnswer>;
        if (typeof parsed.status === 'number') return parsed as ToolAnswer;
    } catch {
        // Not an envelope: the call failed before reaching the route.
    }
    return {
        status: 500,
        body: {
            detail: text ?? 'The call failed.',
        },
    };
};

export const connect = (app: App): Connection => ({
    call: async (name, input, options) => {
        try {
            const result = await app.callServerTool({
                name,
                arguments: input ?? {},
                ...(options?.approved === true
                    ? {
                          _meta: APPROVED_META,
                      }
                    : {}),
            } as never);
            return answerOf(result as never) as never;
        } catch (error) {
            // The host or its connection failed, so answer the way a failed route does.
            return {
                status: 503,
                body: {
                    detail: error instanceof Error ? error.message : 'The host could not reach the CMS.',
                },
            } as never;
        }
    },
});

/**
 * The tools a document's editing routes publish as, and the params they take.
 */
export const toolsFor = (ref: string): { prefix: string; params: Record<string, string> } | undefined => {
    const parsed: DocumentRef | undefined = parseRef(ref);
    if (parsed === undefined) return undefined;
    if (parsed.type === 'page') {
        return parsed.site === undefined
            ? {
                  prefix: 'editing_pages',
                  params: {
                      name: parsed.name,
                  },
              }
            : {
                  prefix: 'editing_sites_pages',
                  params: {
                      site: parsed.site,
                      name: parsed.name,
                  },
              };
    }
    if (parsed.type === 'global') {
        return {
            prefix: 'editing_globals',
            params: {
                name: parsed.name,
            },
        };
    }
    return {
        prefix: 'editing_collections',
        params: {
            name: parsed.collection,
            id: parsed.id,
        },
    };
};
