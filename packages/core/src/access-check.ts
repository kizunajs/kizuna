import type { SecurityScheme } from './security-scheme.js';

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
