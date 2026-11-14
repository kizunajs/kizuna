import type { RouteDefinition, Routes, Method } from './types.js';
import { flattenRoutes } from './handler-pipeline.js';
import type { PathSegment } from './path-params.js';
import { parsePath } from './path-params.js';

interface CompiledRoute {
    routeKey: string;
    route: RouteDefinition;
    segments: PathSegment[];
    paramNames: string[];
    pattern: RegExp;
}

export interface RouteMatch {
    routeKey: string;
    route: RouteDefinition;
    params: Record<string, string>;
}

/**
 * `malformed-path` is a path whose params hold a percent-encoding that does not decode (RFC 3986 section 2.1).
 */
export type MatchResult =
    | { kind: 'matched'; match: RouteMatch }
    | { kind: 'method-mismatch'; allowed: Method[] }
    | { kind: 'malformed-path' }
    | { kind: 'not-found' };

export type PathParamsResult = { kind: 'matched'; params: Record<string, string> } | { kind: 'malformed-path' } | { kind: 'not-found' };

const REGEX_ESCAPE = /[.+?^${}()|[\]\\]/g;
const CHARACTER_CLASS_ESCAPE = /[\\\]^-]/g;

const escapeLiteral = (text: string): string => text.replace(REGEX_ESCAPE, '\\$&');

/**
 * A param that follows another in the same segment, like `:to` in
 * `/range/:from-:to`. It cannot contain the text between the two, apart from
 * being exactly that text, so a path that fails to match fails in linear time
 * instead of trying every split of the segment. path-to-regexp v8, which
 * Express 5 routes with, compiles it the same way and captures the same values.
 */
const paramAfter = (separator: string): string => {
    const character =
        separator.length === 1 ? `[^/${separator.replace(CHARACTER_CLASS_ESCAPE, '\\$&')}]` : `(?:(?!${escapeLiteral(separator)})[^/])`;
    return `(${character}+|${escapeLiteral(separator)})`;
};

const compilePath = (path: string): { segments: PathSegment[]; paramNames: string[]; pattern: RegExp } => {
    const { segments, paramNames } = parsePath(path);
    let body = '';
    // The text since the last param in this path segment, or undefined before the segment's first param.
    let separator: string | undefined;
    for (const segment of segments) {
        if (segment.kind === 'literal') {
            body += escapeLiteral(segment.value);
            separator = separator === undefined || segment.value.includes('/') ? undefined : separator + segment.value;
        } else {
            body += separator ? paramAfter(separator) : '([^/]+)';
            separator = '';
        }
    }
    return {
        segments,
        paramNames,
        pattern: new RegExp(`^${body}$`),
    };
};

const compileRoute = (routeKey: string, route: RouteDefinition): CompiledRoute => ({
    routeKey,
    route,
    ...compilePath(route.path),
});

const decoded = (text: string): string | undefined => {
    try {
        return decodeURIComponent(text);
    } catch {
        return undefined;
    }
};

/**
 * Whether a raw pathname holds a percent-encoding that does not decode, like `/users/%E0`.
 */
export const isMalformedPath = (pathname: string): boolean => pathname.split('/').some((segment) => decoded(segment) === undefined);

const paramsOf = (paramNames: string[], result: RegExpExecArray): PathParamsResult => {
    const params: Record<string, string> = {};
    for (const [index, name] of paramNames.entries()) {
        const captured = result[index + 1];
        if (captured === undefined) continue;
        const value = decoded(captured);
        if (value === undefined) {
            return {
                kind: 'malformed-path',
            };
        }
        params[name] = value;
    }
    return {
        kind: 'matched',
        params,
    };
};

export interface SharedSegmentRoute {
    /**
     * The route's path with each segment that holds several params written as
     * one param, for a router that reads one param per segment, like Hono's.
     */
    routerPath: string;
    /**
     * The route's params, read from the request's raw pathname the way
     * `matchRoute` reads them.
     */
    readParams: (pathname: string) => PathParamsResult;
}

/**
 * How an adapter mounts a route with several params in one segment, like
 * `/range/:from-:to`, so the route gives the same params on every adapter.
 * Returns `undefined` for any other route, which mounts on the framework's
 * router as it is.
 *
 * @example
 * const shared = sharedSegmentRoute('/range/:from-:to');
 * shared?.readParams('/range/2024-01-2024-02');
 */
export const sharedSegmentRoute = (path: string): SharedSegmentRoute | undefined => {
    const pathSegments = path.split('/');
    const holdsSeveral = (segment: string): boolean => parsePath(segment).paramNames.length > 1;
    if (!pathSegments.some(holdsSeveral)) return undefined;
    let sharedIndex = 0;
    const routerPath = pathSegments.map((segment) => (holdsSeveral(segment) ? `:kizunaSegment${sharedIndex++}` : segment)).join('/');
    const { paramNames, pattern } = compilePath(path);
    return {
        routerPath,
        readParams: (pathname) => {
            // The route's path ends where the pathname does, so a prefix the framework strips, like a mount path, falls outside it.
            const tail = pathname.split('/').slice(1 - pathSegments.length);
            const result = pattern.exec('/' + tail.join('/'));
            if (!result) {
                return {
                    kind: 'not-found',
                };
            }
            return paramsOf(paramNames, result);
        },
    };
};

const cache = new WeakMap<Routes, CompiledRoute[]>();

const getCompiled = (routes: Routes): CompiledRoute[] => {
    const existing = cache.get(routes);
    if (existing) return existing;
    const fresh = flattenRoutes(routes).map(({ routeKey, route }) => compileRoute(routeKey, route));
    fresh.sort((a, b) => {
        const limit = Math.min(a.segments.length, b.segments.length);
        for (let index = 0; index < limit; index++) {
            const segmentA = a.segments[index]!;
            const segmentB = b.segments[index]!;
            if (segmentA.kind !== segmentB.kind) {
                return segmentA.kind === 'literal' ? -1 : 1;
            }
        }
        return a.paramNames.length - b.paramNames.length;
    });
    cache.set(routes, fresh);
    return fresh;
};

const stripBasePath = (pathname: string, basePath: string | undefined): string => {
    if (!basePath) return pathname;
    const trimmed = basePath.replace(/\/+$/, '');
    if (pathname === trimmed) return '/';
    if (pathname.startsWith(trimmed + '/')) return pathname.slice(trimmed.length);
    return pathname;
};

export const sortFlattenedRoutes = <T extends { route: RouteDefinition }>(routes: T[]): T[] => {
    const parsed = routes.map((entry) => ({ entry, ...parsePath(entry.route.path) }));
    parsed.sort((a, b) => {
        const limit = Math.min(a.segments.length, b.segments.length);
        for (let index = 0; index < limit; index++) {
            const segmentA = a.segments[index]!;
            const segmentB = b.segments[index]!;
            if (segmentA.kind !== segmentB.kind) {
                return segmentA.kind === 'literal' ? -1 : 1;
            }
        }
        return a.paramNames.length - b.paramNames.length;
    });
    return parsed.map((p) => p.entry);
};

const toMatch = (candidate: CompiledRoute, result: RegExpExecArray): MatchResult => {
    const params = paramsOf(candidate.paramNames, result);
    if (params.kind !== 'matched') return params;
    return {
        kind: 'matched',
        match: {
            routeKey: candidate.routeKey,
            route: candidate.route,
            params: params.params,
        },
    };
};

export const matchRoute = (method: string, pathname: string, routes: Routes, basePath?: string): MatchResult => {
    const target = stripBasePath(pathname, basePath);
    const compiled = getCompiled(routes);
    const allowed = new Set<Method>();
    // The GET route serves HEAD unless a HEAD route claims the path (RFC 9110 §9.3.2).
    let getFallback: { candidate: CompiledRoute; result: RegExpExecArray } | undefined;
    for (const candidate of compiled) {
        const result = candidate.pattern.exec(target);
        if (!result) continue;
        if (candidate.route.method !== method) {
            if (method === 'HEAD' && candidate.route.method === 'GET' && getFallback === undefined) {
                getFallback = {
                    candidate,
                    result,
                };
            }
            allowed.add(candidate.route.method);
            continue;
        }
        return toMatch(candidate, result);
    }
    if (getFallback) {
        return toMatch(getFallback.candidate, getFallback.result);
    }
    if (allowed.size > 0) {
        if (allowed.has('GET')) allowed.add('HEAD');
        return {
            kind: 'method-mismatch',
            allowed: Array.from(allowed),
        };
    }
    return {
        kind: 'not-found',
    };
};
