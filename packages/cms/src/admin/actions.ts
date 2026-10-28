import { parseRef } from '../refs.js';
import type { ToolAnswer } from '../view/connection.js';

/**
 * One button the CMS offers on an item or a record, as the editing routes
 * answer it.
 */
export interface AvailableAction {
    name: string;
    label: string;
    confirm?: string;
    available: boolean;
}

/**
 * A call the admin makes: the tool name that finds its route, and its input.
 */
export interface AdminCall {
    name: string;
    input: Record<string, unknown>;
}

/**
 * What the editor reads after a button runs.
 */
export interface Outcome {
    problem: boolean;
    message: string;
}

/**
 * One segment of a route key as its tool name writes it, the way kizuna's
 * `toToolName` does: `resetPassword` reads `reset_password`.
 */
export const toolSegment = (segment: string): string =>
    segment
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();

/**
 * The buttons to show: the ones that apply to the item as it stands. The
 * server leaves out those the editor may not run.
 */
export const shownActions = (actions: readonly AvailableAction[] | undefined): AvailableAction[] =>
    (actions ?? []).filter((action) => action.available);

/**
 * The call that runs a collection's action on one of its items, or
 * `undefined` when the ref names no item.
 */
export const itemActionCall = (ref: string, action: string): AdminCall | undefined => {
    const parsed = parseRef(ref);
    if (parsed?.type !== 'item') return undefined;
    return {
        name: ['editing', 'actions', parsed.collection, action].map(toolSegment).join('_'),
        input: {
            params: {
                id: parsed.id,
            },
        },
    };
};

interface Problem {
    detail?: string;
    errors?: Array<{
        path?: Array<string | number>;
        message?: string;
    }>;
}

/**
 * What a button's answer says: that it ran, or the server's problem with each
 * field it names.
 */
export const outcomeOf = (answer: ToolAnswer, label: string, done = `Ran ${label}.`): Outcome => {
    if (answer.status >= 200 && answer.status < 300) {
        return {
            problem: false,
            message: done,
        };
    }
    const problem = answer.body as Problem | undefined;
    const fields = (problem?.errors ?? [])
        .filter((error) => error.message !== undefined)
        .map((error) => {
            const message = error.message!.replace(/\.$/, '');
            return error.path === undefined || error.path.length === 0 ? message : `${error.path.join('.')}: ${message}`;
        });
    const detail = problem?.detail ?? `${label} did not run (${answer.status}).`;
    return {
        problem: true,
        message: fields.length === 0 ? detail : `${detail} ${fields.join('. ')}.`,
    };
};
