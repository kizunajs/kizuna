import type { RouteDefinition } from './types.js';

/**
 * How many levels of objects and arrays JSON in a request may nest when neither the route nor the config sets
 * `nestingLimit`.
 */
export const DEFAULT_NESTING_LIMIT = 64;

/**
 * Returns how deep a route's JSON may nest: its own `nestingLimit`, else the config's, else 64.
 */
export const nestingLimitOf = (route: RouteDefinition, configNestingLimit: number | undefined): number =>
    route.nestingLimit ?? configNestingLimit ?? DEFAULT_NESTING_LIMIT;

/**
 * Returns whether a value nests objects and arrays more than `limit` levels deep. It walks a list, not the call
 * stack, so no depth can overflow it.
 */
export const nestsDeeperThan = (value: unknown, limit: number): boolean => {
    const pending: {
        value: unknown;
        depth: number;
    }[] = [
        {
            value,
            depth: 1,
        },
    ];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        if (next.value === null || typeof next.value !== 'object') continue;
        if (next.depth > limit) return true;
        for (const child of Object.values(next.value)) {
            pending.push({
                value: child,
                depth: next.depth + 1,
            });
        }
    }
    return false;
};
