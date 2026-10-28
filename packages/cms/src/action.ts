import { z } from 'zod';
import { Kizuna, type Roles } from 'kizunajs';
import type { FieldAuth } from './field.js';
import type { Caller } from './rules.js';

/**
 * The signed-in editor, as the editor identity's guard returned them.
 */
export type Editor = Record<string, unknown>;

/**
 * What every action's handler receives.
 */
export interface ActionContext<Item> {
    /**
     * The id of the item or record the button is on.
     */
    id: string;
    /**
     * The item: a collection's published item, or a view's record as `get`
     * returned it.
     */
    item: Item;
    editor: Editor;
    /**
     * The app's jobs, to queue work.
     */
    jobs: Record<string, any>;
    /**
     * The plugins' exports, like `plugins.resend`.
     */
    plugins: Record<string, any>;
}

/**
 * A method, so a handler typed from one collection's items still fits where
 * any collection's is taken.
 */
export type ActionHandler<Context> = {
    handle(context: Context): unknown;
}['handle'];

/**
 * An action written out: its button's words, the question asked before it
 * runs, the items it shows on, and who may run it.
 *
 * @example
 * send: {
 *     auth: {
 *         roles: 'admin',
 *     },
 *     confirm: 'Send to everyone on the weekly list?',
 *     handler: async ({ item, plugins }) => {
 *         await plugins.resend.sendBroadcast({
 *             subject: item.subject,
 *         });
 *     },
 * },
 */
export interface ActionOptions<Item, Context = ActionContext<Item>> {
    /**
     * The button's words. Without it, the key, written out.
     */
    label?: string;
    /**
     * A question the editor answers before the handler runs.
     */
    confirm?: string;
    /**
     * Shows the button only for the items it returns true for.
     */
    when?(input: { item: Item }): boolean;
    /**
     * Who sees the button and may run it, in a field's words.
     */
    auth?: FieldAuth;
    handler(context: Context): unknown;
}

/**
 * A button on an item: its handler, or the handler with options.
 */
export type Action<Item, Context = ActionContext<Item>> = ActionHandler<Context> | ActionOptions<Item, Context>;

/**
 * An action with every option in one place.
 */
export interface ResolvedAction {
    key: string;
    label: string;
    confirm: string | undefined;
    when: ((input: { item: unknown }) => boolean) | undefined;
    auth: FieldAuth | undefined;
    handler: (context: Record<string, unknown>) => unknown;
}

/**
 * A name written out for a reader: `resetPassword` reads "Reset password".
 */
export const writtenOut = (name: string): string =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

const ACTION_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Checks the actions a collection or a view declares, and throws naming the
 * owner and the action.
 */
export const assertActions = (actions: unknown, owner: string): void => {
    if (actions === undefined) return;
    if (typeof actions !== 'object' || actions === null || Array.isArray(actions)) {
        throw new Error(`${owner} gives \`actions\` something other than an object of actions, keyed by name.`);
    }
    for (const [key, action] of Object.entries(actions)) {
        if (!ACTION_KEY.test(key)) {
            throw new Error(`${owner} has an action named '${key}'. An action's name is an identifier, like 'send' or 'resetPassword'.`);
        }
        if (typeof action === 'function') continue;
        if (typeof action !== 'object' || action === null || typeof (action as ActionOptions<unknown>).handler !== 'function') {
            throw new Error(`${owner} gives the action '${key}' no handler. An action is a function, or an object with a \`handler\`.`);
        }
        const options = action as ActionOptions<unknown>;
        for (const option of ['label', 'confirm'] as const) {
            if (options[option] !== undefined && (typeof options[option] !== 'string' || options[option] === '')) {
                throw new Error(`${owner} gives the action '${key}' a \`${option}\` that is not text.`);
            }
        }
        if (options.when !== undefined && typeof options.when !== 'function') {
            throw new Error(`${owner} gives the action '${key}' a \`when\` that is not a function.`);
        }
    }
};

/**
 * Every action of a definition, with its options filled in.
 */
export const resolveActions = (actions: Readonly<Record<string, unknown>> | undefined): ResolvedAction[] =>
    Object.entries(actions ?? {}).map(([key, action]) => {
        const options = (
            typeof action === 'function'
                ? {
                      handler: action,
                  }
                : action
        ) as ActionOptions<unknown, Record<string, unknown>>;
        return {
            key,
            label: options.label ?? writtenOut(key),
            confirm: options.confirm,
            when: options.when,
            auth: options.auth,
            handler: options.handler as (context: Record<string, unknown>) => unknown,
        };
    });

const toList = (roles: string | readonly string[] | undefined): readonly string[] =>
    roles === undefined ? [] : typeof roles === 'string' ? [roles] : roles;

/**
 * Why `auth` refuses a caller, or `undefined` when it admits them. Read the
 * way a field's `auth` is: one of the roles, and every permission.
 */
export const accessRefusal = (auth: FieldAuth | undefined, caller: Caller, subject: string): string | undefined => {
    const accepted = toList(auth?.roles);
    const held = toList(caller.role);
    if (accepted.length > 0 && !held.some((role) => accepted.includes(role))) {
        return `${subject} takes the role ${accepted.map((role) => `'${role}'`).join(' or ')}.`;
    }
    const permissions = caller.permissions ?? [];
    for (const [resource, verbs] of Object.entries(auth?.requires ?? {})) {
        for (const verb of verbs) {
            if (!permissions.includes(`${resource}:${verb}`)) return `${subject} requires '${resource}:${verb}'.`;
        }
    }
    return undefined;
};

/**
 * The roles and permissions an `auth` names that the editor identity does
 * not declare, worded for an error.
 */
export const undeclaredAccess = (auth: FieldAuth | undefined, roles: Roles | undefined): string[] => {
    const declared = roles?.names ?? [];
    const catalog = roles?.permissions?.catalog ?? {};
    const undeclared = toList(auth?.roles)
        .filter((role) => !declared.includes(role))
        .map((role) => `accepts the role '${role}'`);
    for (const [resource, verbs] of Object.entries(auth?.requires ?? {})) {
        for (const verb of verbs) {
            if (!catalog[resource]?.includes(verb)) undeclared.push(`requires '${resource}:${verb}'`);
        }
    }
    return undeclared;
};

/**
 * Throws when an action's `auth` names a role or a permission the editor
 * identity does not declare.
 */
export const assertActionAccess = (actions: readonly ResolvedAction[], owner: string, roles: Roles | undefined, label: string): void => {
    for (const action of actions) {
        const [first] = undeclaredAccess(action.auth, roles);
        if (first !== undefined) throw new Error(`${owner} action '${action.key}' ${first}, which ${label} does not declare.`);
    }
};

/**
 * One button the editor shows on an item.
 */
export const AvailableActionSchema = Kizuna.model({
    title: 'CMS.Action',
    schema: z.object({
        name: z.string().describe('The key the action runs under.'),
        label: z.string(),
        confirm: z.string().optional().describe('A question the editor answers before the action runs.'),
        available: z.boolean().describe('Whether the action applies to this item as it stands.'),
    }),
});
