import { z } from 'zod';
import { route, type PluginApi } from 'kizunajs/plugin';
import { adapterContextOf, authenticate } from 'kizunajs/adapter';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { addressOf, CmsHttpError, collectionPreviewPath, type CmsService } from './cms.js';
import { getAtPath } from './content.js';
import type { DraftNotice } from './draft-notices.js';
import type { ResolvedCmsOptions } from './options.js';
import { PREVIEW_COOKIE, PREVIEW_TTL_SECONDS } from './preview-token.js';
import { parseRef } from './refs.js';

/**
 * Where the draft preview listens for changes, under the editing routes.
 */
export const DRAFT_EVENTS_PATH = '/editing/preview/events';

/**
 * How often a quiet stream sends a comment, so proxies keep it open and a
 * preview that ran out is closed.
 */
const HEARTBEAT_MS = 20_000;

/**
 * A draft the page shows changed. `texts` holds the new text at each path
 * the save changed, or is `null` when the page has to render again.
 */
export const DraftChangeSchema = z.object({
    ref: z.string(),
    texts: z.record(z.string(), z.string()).nullable(),
});

/**
 * Logs a draft the stream could not read. A document that is gone answers
 * with a `CmsHttpError`, which is expected. Anything else, like a failed
 * query, is not.
 */
const reportUnread = (ref: string, error: unknown): void => {
    if (error instanceof CmsHttpError) return;
    console.error(`[kizuna-cms] The draft preview could not read ${ref}:`, error);
};

const cookieValue = (header: string | string[] | undefined, name: string): string | undefined => {
    const joined = Array.isArray(header) ? header.join('; ') : header;
    for (const part of joined?.split(';') ?? []) {
        const [key, ...value] = part.trim().split('=');
        if (key !== name) continue;
        try {
            return decodeURIComponent(value.join('='));
        } catch {
            return undefined;
        }
    }
    return undefined;
};

/**
 * `GET /editing/preview/events`: the draft changes of the documents a page in
 * draft mode shows, as server-sent events. `refs` names the documents the page
 * marks, and `path` the address it is at, for a page whose draft is not shown
 * yet, or a collection's preview page. Guarded like the draft route: the
 * preview cookie, or the editor identity.
 */
export const draftEventsRoute = (service: CmsService, options: ResolvedCmsOptions, api: PluginApi, base: '' | `/${string}`) =>
    route({
        method: 'GET',
        path: `${base}${DRAFT_EVENTS_PATH}`,
        auth: false,
        summary: 'Follow the draft changes of what a page in draft mode shows',
        query: z.object({
            refs: z.array(z.string()).optional(),
            path: z.string().optional(),
        }),
        responses: {
            200: {
                stream: {
                    change: DraftChangeSchema,
                },
            },
            401: ProblemDetailsSchema,
        },
    }).handler(async (args) => {
        const query = args.query as {
            refs?: string[];
            path?: string;
        };
        const headers = args.headers as Record<string, string | string[] | undefined>;
        const token = cookieValue(headers['cookie'], PREVIEW_COOKIE);
        const viaCookie = token !== undefined && service.verifiesPreview(token);
        const signedIn = viaCookie
            ? undefined
            : await authenticate(
                  api,
                  options.auth.identity,
                  {
                      headers,
                      query: args.query,
                  },
                  adapterContextOf(args as unknown as Record<string, unknown>)
              );
        const role = signedIn?.['role'];
        const allowed =
            viaCookie ||
            (signedIn !== undefined &&
                (service.roles === undefined ||
                    (Array.isArray(role) ? role : [role]).some((held) => service.roles!.includes(held as string))));
        if (!allowed) {
            return args.throwError({
                status: 401,
                body: {
                    detail: 'Open draft mode as an editor first.',
                },
            });
        }
        const openedAt = Date.now();
        // Closing a stream whose preview ran out makes the browser reconnect with the renewed cookie.
        const stillAllowed = (): boolean =>
            viaCookie && token !== undefined ? service.verifiesPreview(token) : Date.now() < openedAt + PREVIEW_TTL_SECONDS * 1000;

        const wanted = new Set(query.refs ?? []);
        const shown = async (notice: DraftNotice): Promise<boolean> => {
            if (wanted.has(notice.ref)) return true;
            const ref = query.path === undefined ? undefined : parseRef(notice.ref);
            if (ref === undefined) return false;
            try {
                const state = await service.draftState(ref);
                const content = state.row?.draft ?? state.row?.published;
                if (addressOf(state.target, content) === query.path) return true;
                // A preview page that has nothing to show yet marks nothing, so it follows the item by its path.
                const preview = collectionPreviewPath(state.target, content);
                return preview !== undefined && new URL(preview, 'http://cms.local').pathname === query.path;
            } catch (error) {
                reportUnread(notice.ref, error);
                return false;
            }
        };
        const textsOf = async (notice: DraftNotice): Promise<Record<string, string> | null> => {
            const ref = parseRef(notice.ref);
            if (notice.paths === null || notice.paths.length === 0 || ref === undefined) return null;
            const draft = await service.draft(ref).catch((error: unknown) => {
                reportUnread(notice.ref, error);
                return undefined;
            });
            if (draft === undefined) return null;
            const texts: Record<string, string> = {};
            for (const path of notice.paths) {
                const value = getAtPath(draft.content, path);
                if (typeof value !== 'string') return null;
                texts[path] = value;
            }
            return texts;
        };

        return {
            status: 200,
            headers: {
                'x-accel-buffering': 'no',
            },
            body: async function* ({ signal }) {
                const pending: DraftNotice[] = [];
                let wake: (() => void) | undefined;
                const unsubscribe = await service.notices.subscribe((notice) => {
                    pending.push(notice);
                    wake?.();
                });
                const onAbort = (): void => wake?.();
                signal.addEventListener('abort', onAbort);
                try {
                    yield {
                        comment: 'listening',
                    };
                    while (!signal.aborted) {
                        const notice = pending.shift();
                        if (notice === undefined) {
                            const quiet = await new Promise<boolean>((resolve) => {
                                const timer = setTimeout(() => resolve(true), HEARTBEAT_MS);
                                wake = () => {
                                    clearTimeout(timer);
                                    resolve(false);
                                };
                            });
                            wake = undefined;
                            if (!quiet) continue;
                            if (!stillAllowed()) return;
                            yield {
                                comment: 'keep-alive',
                            };
                            continue;
                        }
                        if (!(await shown(notice))) continue;
                        yield {
                            event: 'change',
                            data: {
                                ref: notice.ref,
                                texts: await textsOf(notice),
                            },
                        };
                    }
                } finally {
                    signal.removeEventListener('abort', onAbort);
                    unsubscribe();
                }
            },
        };
    });
