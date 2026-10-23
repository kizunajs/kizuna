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

export type MatchResult = { kind: 'matched'; match: RouteMatch } | { kind: 'method-mismatch'; allowed: Method[] } | { kind: 'not-found' };

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
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

const compileRoute = (routeKey: string, route: RouteDefinition): CompiledRoute => {
    const { segments, paramNames } = parsePath(route.path);
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
        routeKey,
        route,
        segments,
        paramNames,
        pattern: new RegExp(`^${body}$`),
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

/**
 * The captured params, decoded, or undefined when one is not valid
 * percent-encoding, which matches nothing.
 */
const paramsOf = (candidate: CompiledRoute, result: RegExpExecArray): Record<string, string> | undefined => {
    const params: Record<string, string> = {};
    for (const [index, name] of candidate.paramNames.entries()) {
        const captured = result[index + 1];
        if (captured === undefined) continue;
        try {
            params[name] = decodeURIComponent(captured);
        } catch {
            return undefined;
        }
    }
    return params;
};

const toMatch = (candidate: CompiledRoute, params: Record<string, string>): MatchResult => ({
    kind: 'matched',
    match: {
        routeKey: candidate.routeKey,
        route: candidate.route,
        params,
    },
});

export const matchRoute = (method: string, pathname: string, routes: Routes, basePath?: string): MatchResult => {
    const target = stripBasePath(pathname, basePath);
    const compiled = getCompiled(routes);
    const allowed = new Set<Method>();
    // The GET route serves HEAD unless a HEAD route claims the path (RFC 9110 §9.3.2).
    let getFallback: { candidate: CompiledRoute; params: Record<string, string> } | undefined;
    for (const candidate of compiled) {
        const result = candidate.pattern.exec(target);
        if (!result) continue;
        const params = paramsOf(candidate, result);
        if (!params) continue;
        if (candidate.route.method !== method) {
            if (method === 'HEAD' && candidate.route.method === 'GET' && getFallback === undefined) {
                getFallback = {
                    candidate,
                    params,
                };
            }
            allowed.add(candidate.route.method);
            continue;
        }
        return toMatch(candidate, params);
    }
    if (getFallback) {
        return toMatch(getFallback.candidate, getFallback.params);
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
