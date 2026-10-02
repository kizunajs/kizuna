import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import type { Page } from './page.js';
import type { PageMap } from './options.js';

const PARAM = /^\[([^\]]+)\]$/;

/**
 * The params a route pattern names, in order: `/blog/[slug]` has `slug`.
 * Catch-all segments come back with their dots, for the check to refuse.
 */
export const routeParamsOf = (path: string): string[] =>
    path
        .split('/')
        .map((segment) => PARAM.exec(segment)?.[1])
        .filter((param): param is string => param !== undefined);

export const isDynamicPath = (path: string): boolean => routeParamsOf(path).length > 0;

/**
 * The params of a route pattern, as a type: `/blog/[slug]` takes
 * `{ slug: string }`.
 */
export type ParamsOf<Path extends string> = Path extends `${string}[${infer Param}]${infer Rest}`
    ? {
          [Key in Param]: string;
      } & ParamsOf<Rest>
    : {};

/**
 * The address an instance is served at, filled from its content, or
 * `undefined` while a param's field is empty.
 */
export const fillPath = (pattern: string, content: Record<string, unknown> | null | undefined): string | undefined => {
    let complete = true;
    const filled = pattern
        .split('/')
        .map((segment) => {
            const param = PARAM.exec(segment)?.[1];
            if (param === undefined) return segment;
            const value = content?.[param];
            if (typeof value !== 'string' || value === '') {
                complete = false;
                return segment;
            }
            return encodeURIComponent(value);
        })
        .join('/');
    return complete ? filled : undefined;
};

/**
 * The params of a concrete path when it matches the pattern, decoded.
 */
export const matchPath = (pattern: string, path: string): Record<string, string> | undefined => {
    const expected = pattern.split('/');
    const given = path.replace(/\/$/, '').split('/');
    if (expected.length !== given.length) return undefined;
    const params: Record<string, string> = {};
    for (const [index, segment] of expected.entries()) {
        const actual = given[index]!;
        const param = PARAM.exec(segment)?.[1];
        if (param === undefined) {
            if (segment !== actual) return undefined;
            continue;
        }
        if (actual === '') return undefined;
        try {
            params[param] = decodeURIComponent(actual);
        } catch {
            return undefined;
        }
    }
    return params;
};

/**
 * A route a collection's items are served at, such as `/blog/[slug]` for
 * `blogPostPage`.
 */
export interface ServedRoute {
    page: string;
    /**
     * The site the page belongs to.
     */
    site: string;
    pattern: string;
    params: string[];
}

/**
 * The routes that serve a collection's items, in the order the pages are
 * listed.
 */
export const routesOf = (collection: string, pages: PageMap, site = 'default'): ServedRoute[] =>
    Object.entries(pages)
        .filter(([, entry]) => entry.page.collection?.name === collection)
        .map(([name, entry]) => ({
            page: name,
            site,
            pattern: entry.path,
            params: routeParamsOf(entry.path),
        }));

/**
 * The fields that make up an item's address on any route that serves it.
 * Each is indexed, and unique within the collection.
 */
export const addressFieldsOf = (collection: string, pages: PageMap): string[] => [
    ...new Set(routesOf(collection, pages).flatMap((route) => route.params)),
];

/**
 * What is wrong with a page at a path: a dynamic route with no collection, a
 * collection on a static route, a catch-all segment, or a param that names no
 * text field of the collection.
 */
export const routeProblems = (path: string, page: Page): string[] => {
    const params = routeParamsOf(path);
    if (params.length === 0) {
        return page.collection === undefined
            ? []
            : [
                  `${page.name} serves the ${page.collection.name} collection, but ${path} is a static route. A page that shows one item per address sits at a dynamic route, like app/blog/[slug].`,
              ];
    }
    if (page.collection === undefined) {
        return [
            `${path} is a dynamic route, so ${page.name} shows one item of a collection per address. Give it the collection, like \`collection: articles\`.`,
        ];
    }
    const problems: string[] = [];
    for (const param of params) {
        if (param.startsWith('...') || param.startsWith('[')) {
            problems.push(`${path} has the catch-all segment [${param}]. A content route takes one field per segment, like [slug].`);
            continue;
        }
        const field = page.collection.fields.find((candidate) => candidate.name === param);
        if (field === undefined) {
            problems.push(
                `${path} has the param [${param}], but the ${page.collection.name} collection has no field named '${param}'. Each route param reads the field it names.`
            );
            continue;
        }
        const type = readDef(unwrapOptionalWrappers(field.schema).inner).type;
        if (type !== 'string' && type !== 'enum') {
            problems.push(
                `The ${page.collection.name} collection's '${param}' field is part of an address, so it has to be text, like z.string().`
            );
        }
    }
    return problems;
};
