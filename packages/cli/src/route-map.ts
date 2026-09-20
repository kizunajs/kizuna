import type { ApiDefinition, RouteAuth, RouteDefinition } from 'kizunajs';
import { createGenerator, deriveToolNames, toToolName } from 'kizunajs/generator';

/**
 * One route, flattened to what someone reading a terminal wants to know.
 */
export interface RouteEntry {
    key: string;
    method: string;
    path: string;
    auth: string;
    tags: string[];
    tool?: string;
    deprecated?: string;
    sunset?: string;
}

const permissionList = (requires: unknown): string => {
    if (!requires || typeof requires !== 'object') return '';
    return Object.entries(requires as Record<string, readonly string[]>)
        .map(([subject, actions]) => `${subject}:${actions.join('|')}`)
        .join(' ');
};

/**
 * What a route's `auth` asks of a caller, in one cell.
 */
const describeAuth = (auth: RouteAuth | undefined): string => {
    if (auth === undefined || auth === false) return 'public';
    if (typeof auth === 'string') return auth;
    if (Array.isArray(auth)) return auth.join('|');

    const rule = auth as { identity: string | readonly string[]; roles?: string | readonly string[]; requires?: unknown };
    const identity = Array.isArray(rule.identity) ? rule.identity.join('|') : String(rule.identity);
    const roles = rule.roles === undefined ? '' : Array.isArray(rule.roles) ? rule.roles.join('|') : String(rule.roles);
    const requires = permissionList(rule.requires);
    return [identity, roles && `roles ${roles}`, requires && `requires ${requires}`].filter(Boolean).join(', ');
};

const describeSunset = (sunset: RouteDefinition['sunset']): string | undefined => {
    if (sunset === undefined) return undefined;
    return typeof sunset === 'string' ? sunset : sunset.date;
};

/**
 * Every route an api serves, in the order it declares them.
 */
export const routeMap = createGenerator((_options: Record<string, never>, _api: ApiDefinition) => {
    const entries: RouteEntry[] = [];
    const toolKeys: Array<{ key: string; origin: 'route' }> = [];

    return {
        processRoute({ routeKey, route, routeTags, deprecated, deprecationMessage }) {
            if (route.tool) toolKeys.push({ key: routeKey, origin: 'route' });
            entries.push({
                key: routeKey,
                method: route.method,
                path: route.path,
                auth: describeAuth(route.auth),
                tags: routeTags,
                deprecated: deprecated ? (deprecationMessage ?? '') : undefined,
                sunset: describeSunset(route.sunset),
            });
        },
        finalize(): RouteEntry[] {
            // `deriveToolNames` throws on a clash, which is the same answer the
            // MCP endpoint gives, so the map never shows a name it would refuse.
            const names = toolKeys.length > 0 ? deriveToolNames(toolKeys) : new Map<string, string>();
            return entries.map((entry) => ({
                ...entry,
                tool: names.get(entry.key) ?? (toolKeys.some((tool) => tool.key === entry.key) ? toToolName(entry.key) : undefined),
            }));
        },
    };
});

const pad = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - text.length));

/**
 * The route map as aligned columns, one route per line.
 */
export const formatRoutes = (entries: readonly RouteEntry[]): string => {
    if (entries.length === 0) return 'This config declares no routes.';

    const methodWidth = Math.max(...entries.map((entry) => entry.method.length));
    const pathWidth = Math.max(...entries.map((entry) => entry.path.length));
    const keyWidth = Math.max(...entries.map((entry) => entry.key.length));

    return entries
        .map((entry) => {
            const notes = [
                `auth: ${entry.auth}`,
                entry.tool && `tool: ${entry.tool}`,
                entry.deprecated !== undefined && `deprecated${entry.deprecated ? `, ${entry.deprecated}` : ''}`,
                entry.sunset && `sunset ${entry.sunset}`,
            ].filter(Boolean);
            return `${pad(entry.method, methodWidth)}  ${pad(entry.path, pathWidth)}  ${pad(entry.key, keyWidth)}  ${notes.join('  ')}`.trimEnd();
        })
        .join('\n');
};
