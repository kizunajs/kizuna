import { permissionNames } from './permissions.js';
import type { SecurityScheme } from './security-scheme.js';
import type { RequiredPermissions } from './types.js';

export interface AccessCheckInput {
    roles: readonly string[] | undefined;
    requires: RequiredPermissions | undefined;
    requiredSchemes: readonly string[];
    schemes: Record<string, SecurityScheme> | undefined;
    securityContext: Record<string, unknown>;
}

/**
 * A guard's return with `permissions` settled: what the role holds, narrowed to
 * the list the guard returned when it returned one. Anything the role cannot
 * hold is dropped. Unchanged for an identity whose roles carry no permissions.
 */
export const withPermissions = (scheme: string, definition: SecurityScheme | undefined, result: unknown): unknown => {
    const roles = definition?.roles;
    if (roles === undefined) return result;
    const returned = (result ?? {}) as { role?: unknown; permissions?: unknown };
    if (typeof returned.role !== 'string' && !Array.isArray(returned.role)) {
        throw new Error(`The guard for "${scheme}" returned no role, and the identity declares roles.`);
    }
    if (roles.permissions === undefined) return returned;
    const held: string[] = roles.of(returned.role as string | readonly string[]);
    const given = Array.isArray(returned.permissions) ? (returned.permissions as string[]) : undefined;
    return {
        ...returned,
        permissions: given === undefined ? held : held.filter((permission) => given.includes(permission)),
    };
};

const rolesHeldBy = (input: AccessCheckInput): Set<string> => {
    const held = new Set<string>();
    for (const scheme of input.requiredSchemes) {
        const context = input.securityContext[scheme] as { role?: unknown } | undefined;
        if (typeof context?.role === 'string') held.add(context.role);
        if (Array.isArray(context?.role)) for (const role of context.role as string[]) held.add(role);
    }
    return held;
};

const heldBy = (input: AccessCheckInput): Set<string> => {
    const held = new Set<string>();
    for (const scheme of input.requiredSchemes) {
        const context = input.securityContext[scheme] as { permissions?: unknown } | undefined;
        if (!Array.isArray(context?.permissions)) continue;
        for (const permission of context.permissions as string[]) held.add(permission);
    }
    return held;
};

/**
 * The permissions a route requires that an OAuth caller's role holds but the
 * token does not carry. A token with more scope would pass, so the `403` says
 * `insufficient_scope`. Empty when no new token could help.
 */
export const insufficientScope = (input: AccessCheckInput): string[] => {
    if (input.requires === undefined) return [];
    const required = permissionNames(input.requires);
    const missing = new Set<string>();
    for (const scheme of input.requiredSchemes) {
        const definition = input.schemes?.[scheme];
        const type = definition?.openapi?.type;
        const roles = definition?.roles;
        if ((type !== 'oauth2' && type !== 'openIdConnect') || roles?.permissions === undefined) continue;
        const context = input.securityContext[scheme] as { role?: unknown; permissions?: unknown } | undefined;
        if (typeof context?.role !== 'string' && !Array.isArray(context?.role)) continue;
        const roleHolds: string[] = roles.of(context.role as string | readonly string[]);
        const carried = Array.isArray(context.permissions) ? (context.permissions as string[]) : [];
        for (const permission of required) {
            if (roleHolds.includes(permission) && !carried.includes(permission)) missing.add(permission);
        }
    }
    return [...missing];
};

/**
 * The `403` detail when the caller holds none of the roles the route accepts
 * or lacks a permission it requires, or `undefined`.
 */
export const requiresDenial = (input: AccessCheckInput): string | undefined => {
    if (input.roles !== undefined && input.roles.length > 0) {
        const held = rolesHeldBy(input);
        if (!input.roles.some((role) => held.has(role))) {
            return input.roles.length === 1
                ? `Forbidden: this route requires the ${input.roles[0]} role.`
                : `Forbidden: this route requires one of the roles ${input.roles.join(', ')}.`;
        }
    }
    if (input.requires === undefined) return undefined;
    const held = heldBy(input);
    const missing = permissionNames(input.requires).filter((permission) => !held.has(permission));
    return missing.length === 0 ? undefined : `Forbidden: this route requires ${missing.join(', ')}.`;
};
