import { z } from 'zod';
import type { RouteAuth } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { CmsHttpError, type CmsService } from './cms.js';
import type { Collection } from './definitions.js';
import type { Caller } from './rules.js';
import { accessRefusal, AvailableActionSchema, resolveActions, writtenOut, type ResolvedAction } from './action.js';

/**
 * Whether an action's `when` admits the item, as it does when there is none.
 */
export const appliesTo = (action: ResolvedAction, item: unknown): boolean =>
    action.when === undefined ||
    action.when({
        item,
    });

/**
 * The actions a caller may run, each saying whether it applies to the item.
 * An item with nothing published has none that apply.
 */
export const availableActions = (
    actions: readonly ResolvedAction[],
    item: unknown,
    caller: Caller
): z.output<typeof AvailableActionSchema>[] =>
    actions
        .filter((action) => accessRefusal(action.auth, caller, action.label) === undefined)
        .map((action) => ({
            name: action.key,
            label: action.label,
            ...(action.confirm === undefined
                ? {}
                : {
                      confirm: action.confirm,
                  }),
            available: item !== undefined && appliesTo(action, item),
        }));

/**
 * Refuses an action the caller may not run.
 */
export const assertMayRun = (action: ResolvedAction, caller: Caller): void => {
    const refusal = accessRefusal(action.auth, caller, `The action '${action.key}'`);
    if (refusal !== undefined) {
        throw new CmsHttpError(403, {
            detail: refusal,
        });
    }
};

/**
 * Refuses an action whose `when` turns the item down.
 */
export const assertApplies = (action: ResolvedAction, item: unknown): void => {
    if (!appliesTo(action, item)) {
        throw new CmsHttpError(409, {
            detail: `'${action.label}' does not apply to this item as it stands.`,
        });
    }
};

/**
 * An action as an MCP tool: one with a `confirm` waits for the person's
 * approval, as the button asks them first.
 */
export const actionTool = (action: ResolvedAction): true | { needsApproval: true } =>
    action.confirm === undefined
        ? true
        : {
              needsApproval: true,
          };

/**
 * What a handler of the CMS's editing routes reads from its arguments.
 */
export interface EditingArgs {
    params: Record<string, string>;
    query: Record<string, unknown> | undefined;
    body: unknown;
    plugins?: Record<string, unknown>;
    auth?: Record<string, Record<string, unknown>>;
}

/**
 * Wraps an editing handler so a `CmsHttpError` answers as problem details.
 */
export type Guarded = (fn: (cms: CmsService, args: EditingArgs) => Promise<{ status: number; body?: unknown }>) => unknown;

/**
 * What every handler receives beside the item: the editor, and the api's
 * jobs and plugins.
 */
export const handlerContext = (cms: CmsService, args: EditingArgs) => {
    const { jobs, plugins } = args as unknown as {
        jobs?: Record<string, unknown>;
        plugins?: Record<string, unknown>;
    };
    return {
        editor: args.auth?.[cms.identity] ?? {},
        jobs: jobs ?? {},
        plugins: plugins ?? {},
    };
};

/**
 * The actions of one item of a collection, for `describe`.
 */
export const itemActions = async (
    cms: CmsService,
    collection: Collection,
    id: string,
    caller: Caller
): Promise<z.output<typeof AvailableActionSchema>[]> => {
    const actions = resolveActions(collection.actions);
    if (actions.length === 0) return [];
    const published = await cms.published({
        type: 'item',
        collection: collection.name,
        id,
    });
    return availableActions(actions, published?.content, caller);
};

/**
 * `POST /editing/collections/<name>/items/:id/actions/<action>` for each
 * action of each collection, run as the signed-in editor on the published
 * item.
 */
export const collectionActionRoutes = (input: {
    collections: readonly Collection[];
    editor: RouteAuth;
    editingBase: `/${string}`;
    guarded: Guarded;
}) =>
    Object.fromEntries(
        input.collections
            .filter((collection) => Object.keys(collection.actions ?? {}).length > 0)
            .map((collection) => [
                collection.name,
                Object.fromEntries(
                    resolveActions(collection.actions).map((action) => [
                        action.key,
                        route({
                            method: 'POST',
                            path: `${input.editingBase}/collections/${collection.name}/items/:id/actions/${action.key}`,
                            auth: input.editor,
                            summary: `Run "${action.label}" on a published item of ${writtenOut(collection.name).toLowerCase()}`,
                            tool: actionTool(action),
                            ...(action.confirm === undefined
                                ? {}
                                : {
                                      description: `Asks first: "${action.confirm}"`,
                                  }),
                            pathParams: z.object({
                                id: z.string(),
                            }),
                            responses: {
                                204: z.void(),
                                403: ProblemDetailsSchema,
                                404: ProblemDetailsSchema,
                                409: ProblemDetailsSchema,
                            },
                        }).handler(
                            input.guarded(async (cms, args) => {
                                const id = args.params['id']!;
                                const ref = {
                                    type: 'item' as const,
                                    collection: collection.name,
                                    id,
                                };
                                assertMayRun(action, cms.caller(args.auth));
                                const published = await cms.published(ref);
                                if (published === undefined) {
                                    if ((await cms.draftState(ref)).row === undefined) {
                                        throw new CmsHttpError(404, {
                                            detail: `There is no item '${id}' in '${collection.name}'.`,
                                        });
                                    }
                                    throw new CmsHttpError(409, {
                                        detail: `The item '${id}' is not published. Publish it first.`,
                                    });
                                }
                                assertApplies(action, published.content);
                                await action.handler({
                                    id,
                                    item: published.content,
                                    ...handlerContext(cms, args),
                                });
                                return {
                                    status: 204,
                                };
                            }) as never
                        ),
                    ])
                ),
            ])
    );
