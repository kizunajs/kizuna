import { parseRef } from '../refs.js';
import { toolsFor, type ToolAnswer } from '../view/connection.js';
import { outcomeOf, type AdminCall } from './actions.js';

export type BulkAction = 'publish' | 'unpublish' | 'delete';

interface BulkWords {
    label: string;
    done: string;
    question: (count: string) => string;
}

const WORDS: Record<BulkAction, BulkWords> = {
    publish: {
        label: 'Publish',
        done: 'Published',
        question: (count) => `Publish ${count}? Every visitor sees them at once.`,
    },
    unpublish: {
        label: 'Unpublish',
        done: 'Unpublished',
        question: (count) => `Unpublish ${count}? Their drafts stay, and visitors stop seeing them.`,
    },
    delete: {
        label: 'Delete',
        done: 'Deleted',
        question: (count) => `Delete ${count}, with their history? Pages that show them stop showing them.`,
    },
};

const SUFFIXES: Record<BulkAction, string> = {
    publish: 'publish',
    unpublish: 'unpublish',
    delete: 'delete_item',
};

/**
 * The tool prefix of what a list holds: items of a collection, or pages.
 */
export type BulkTargets = 'editing_collections' | 'editing_pages';

export const BULK_ACTIONS: readonly BulkAction[] = ['publish', 'unpublish', 'delete'];

export const bulkLabelOf = (action: BulkAction): string => WORDS[action].label;

/**
 * The actions the bar offers: those the CMS has a route for. Pages come
 * from code, so none is deleted.
 */
export const offeredActions = (routes: Readonly<Record<string, unknown>>, targets: BulkTargets = 'editing_collections'): BulkAction[] =>
    BULK_ACTIONS.filter((action) => routes[`${targets}_${SUFFIXES[action]}`] !== undefined);

const itemsOf = (count: number): string => (count === 1 ? '1 item' : `${count} items`);

/**
 * What the bar asks before it runs an action on the items ticked.
 */
export const bulkQuestionOf = (action: BulkAction, count: number): string => WORDS[action].question(itemsOf(count));

/**
 * The call that runs an action on one item or page, or `undefined` when the
 * ref names neither, or names a page to delete.
 */
export const bulkCallOf = (action: BulkAction, ref: string): AdminCall | undefined => {
    const parsed = parseRef(ref);
    if (parsed === undefined || parsed.type === 'global' || (parsed.type === 'page' && action === 'delete')) return undefined;
    const tools = toolsFor(ref);
    if (tools === undefined) return undefined;
    const params = tools.params;
    return {
        name: `${tools.prefix}_${SUFFIXES[action]}`,
        input:
            action === 'delete'
                ? {
                      params,
                  }
                : {
                      params,
                      body: {},
                  },
    };
};

export interface BulkTarget {
    ref: string;
    title: string;
}

/**
 * How one item went: done, or the server's reason it was not.
 */
export interface BulkResult extends BulkTarget {
    problem: string | undefined;
}

/**
 * Runs an action on each item in turn, so one refusal leaves the others to
 * run, and answers how each went.
 */
export const runBulk = async (
    action: BulkAction,
    targets: readonly BulkTarget[],
    call: (name: string, input: Record<string, unknown>) => Promise<ToolAnswer>
): Promise<BulkResult[]> => {
    const results: BulkResult[] = [];
    for (const target of targets) {
        const planned = bulkCallOf(action, target.ref);
        if (planned === undefined) {
            results.push({
                ...target,
                problem: `${WORDS[action].label} does not run on ${target.title}.`,
            });
            continue;
        }
        const answer = await call(planned.name, planned.input);
        const outcome = outcomeOf(answer, WORDS[action].label);
        results.push({
            ...target,
            problem: outcome.problem ? outcome.message : undefined,
        });
    }
    return results;
};

/**
 * What the bar says once an action has run: how many it did, and each item
 * it did not, with the reason.
 */
export interface BulkSummary {
    problem: boolean;
    message: string;
    failures: Array<{
        title: string;
        problem: string;
    }>;
}

export const bulkSummaryOf = (action: BulkAction, results: readonly BulkResult[]): BulkSummary => {
    const words = WORDS[action];
    const failures = results.flatMap((result) =>
        result.problem === undefined
            ? []
            : [
                  {
                      title: result.title,
                      problem: result.problem,
                  },
              ]
    );
    const done = results.length - failures.length;
    const message =
        failures.length === 0
            ? `${words.done} ${itemsOf(done)}.`
            : done === 0
              ? `${words.label} did not run on ${failures.length === 1 ? 'the item' : `any of the ${failures.length} items`}.`
              : `${words.done} ${done} of ${itemsOf(results.length)}.`;
    return {
        problem: failures.length > 0,
        message,
        failures,
    };
};
