import { z } from 'zod';
import type { PageMap } from './options.js';
import type { Collection, Global } from './definitions.js';

/**
 * What every site declares: what editors call it, where it is served, and
 * its icon. Add fields of your own with `.extend()`.
 *
 * @example
 * export const Site = SiteSchema.extend({
 *     companyName: z.string(),
 * });
 */
export const SiteSchema = z.object({
    /**
     * What editors call the site, like `'Hagen UK'`.
     */
    label: z.string().min(1),
    /**
     * Where the site is served, like `'https://hagen.example.co.uk'`.
     */
    url: z.url(),
    /**
     * The site's icon: a path on the site, like `'/icons/uk.svg'`, or a full URL.
     */
    icon: z.string().refine((icon) => (icon.startsWith('/') && !icon.startsWith('//')) || /^https?:\/\//.test(icon), {
        error: 'is a path on the site, like `/icons/uk.svg`, or a full http or https URL',
    }),
    /**
     * The languages the site serves, like `['en']`.
     */
    locales: z.array(z.string().min(1)).min(1).optional(),
    /**
     * Whether the site is live, or kept offline while it is built.
     */
    status: z.enum(['live', 'offline']).optional(),
});

/**
 * A site's built-in fields, as `SiteSchema` reads them.
 */
export type SiteValues = z.output<typeof SiteSchema>;

/**
 * What a site holds besides its fields: its pages, and the globals and
 * collections only it has.
 */
export interface SiteContent {
    /**
     * The site's pages, made with `definePages()` in the content package.
     * Sites deployed from one app share one module, and each keeps its own
     * page documents.
     */
    pages?: PageMap;
    /**
     * Globals only this site has. Their names never repeat a shared one.
     */
    globals?: readonly Global[];
    /**
     * Collections only this site has. Their names never repeat a shared one.
     */
    collections?: readonly Collection[];
}

// Registry-global, so sites declared by another copy of this package still read as sites.
const SITES: unique symbol = Symbol.for('kizuna.cms.sites') as symbol as typeof SITES;

/**
 * The sites `declareSites()` made, for `sites` on `cms()`.
 */
export interface DeclaredSites<
    Site extends SiteValues = SiteValues,
    Entries extends Record<string, SiteContent> = Record<string, SiteContent>,
> {
    readonly [SITES]: true;
    /**
     * Each site as declared.
     */
    readonly entries: Entries;
    /**
     * Each site's fields, as its schema parsed them.
     */
    readonly values: Readonly<Record<keyof Entries, Site>>;
}

/**
 * The sites as declared, keyed by name.
 */
export type SiteEntriesOf<Sites> = Sites extends { readonly entries: infer Entries } ? Entries : never;

/**
 * A declared site's fields, as its schema reads them.
 */
export type SiteFieldsOf<Sites> = Sites extends { readonly values: Readonly<Record<any, infer Site>> } ? Site : never;

const CONTENT_KEYS = ['pages', 'globals', 'collections'];

/**
 * A site's name: lowercase, like `uk` or `norway`.
 */
export const SITE_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * The sites one CMS serves, keyed by name, each with the fields `schema`
 * declares, its pages and the content only it has. Content on `cms()` is
 * shared by every site.
 *
 * @example
 * export const sites = declareSites(Site, {
 *     uk: {
 *         label: 'Hagen UK',
 *         url: 'https://hagen.example.co.uk',
 *         icon: '/icons/uk.svg',
 *         pages: countryPages,
 *         collections: [Events],
 *         companyName: 'Hagen UK Ltd',
 *     },
 * });
 */
export const declareSites = <
    Schema extends z.ZodType<SiteValues, any>,
    Entries extends { [Key in keyof Entries]: z.input<Schema> & SiteContent },
>(
    schema: Schema,
    entries: Entries
): DeclaredSites<z.output<Schema>, Entries> => {
    const values: Record<string, z.output<Schema>> = {};
    if (Object.keys(entries).length === 0) throw new Error('declareSites() declares no sites. Name at least one, like uk.');
    for (const [name, entry] of Object.entries(entries as Record<string, SiteContent>)) {
        if (!SITE_NAME.test(name)) {
            throw new Error(`declareSites() has a site named '${name}'. A site name is lowercase, like uk or norway.`);
        }
        if (name === 'default') {
            throw new Error("declareSites() has a site named 'default', which the CMS keeps for shared content. Name it after the site.");
        }
        const fields = Object.fromEntries(Object.entries(entry).filter(([key]) => !CONTENT_KEYS.includes(key)));
        const parsed = schema.safeParse(fields);
        if (!parsed.success) {
            const issue = parsed.error.issues[0]!;
            const path = issue.path.map(String).join('.');
            throw new Error(
                `declareSites() gives the ${name} site ${path === '' ? 'fields' : `a \`${path}\``} that fail: ${issue.message}.`
            );
        }
        values[name] = parsed.data;
    }
    return {
        [SITES]: true,
        entries,
        values,
    } as DeclaredSites<z.output<Schema>, Entries>;
};

export const isDeclaredSites = (value: unknown): value is DeclaredSites => typeof value === 'object' && value !== null && SITES in value;
