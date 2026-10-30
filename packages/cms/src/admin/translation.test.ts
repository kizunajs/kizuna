import { describe, expect, it } from 'vitest';
import type { Connection } from '../view/connection.js';
import type { DescribedField, Description } from '../view/schema.js';
import { refInLocale, translationConnection, withSourceFields } from './translation.js';
import { localeStatusOf } from './locale-tabs.js';
import { hrefIn, screenOf, setAdminPath } from './navigation.js';

const field = (path: string, extra: Partial<DescribedField> = {}): DescribedField => ({
    path,
    name: path,
    readOnly: false,
    required: true,
    writable: true,
    schema: {
        type: 'string',
    },
    ...extra,
});

const described = (ref: string, fields: DescribedField[], draft: Record<string, unknown>): Description => ({
    ref,
    kind: 'item',
    name: 'oslo',
    path: null,
    previewPath: null,
    usedOn: {
        everywhere: false,
        pages: [],
        partners: [],
    },
    status: 'draft',
    version: 1,
    complete: true,
    missing: [],
    fields,
    layout: [],
    draft,
    owner: null,
    review: null,
    requireReview: false,
    canPublish: true,
});

const source = described('item:offices:oslo', [field('name'), field('city', { translated: true })], {
    name: 'Hagen Oslo',
    city: 'Oslo',
});

const translation = described('item:offices:oslo@nb', [field('city', { translated: true, sourceValue: 'Oslo' })], {
    city: 'Oslo by',
});

describe('a translation in the admin', () => {
    it('shows every field of the source, the translated ones editable and the others locked with the source value', () => {
        const shown = withSourceFields(translation, source);
        expect(shown.fields.map((each) => [each.path, each.writable])).toEqual([
            ['name', false],
            ['city', true],
        ]);
        expect(shown.draft).toEqual({
            name: 'Hagen Oslo',
            city: 'Oslo by',
        });
    });

    it('names the language on the calls that work on one copy, and keeps the source values in what they answer', async () => {
        const calls: Array<[string, unknown]> = [];
        const connection: Connection = {
            call: async (name, input) => {
                calls.push([name, input]);
                if (name === 'editing_describe') {
                    const ref = (input?.['query'] as { ref: string }).ref;
                    return {
                        status: 200,
                        body: ref === source.ref ? source : translation,
                    } as never;
                }
                return {
                    status: 200,
                    body: {
                        ref: translation.ref,
                        content: {
                            city: 'Oslo sentrum',
                        },
                    },
                } as never;
            },
        };
        const translated = translationConnection(connection, translation.ref);
        expect(translationConnection(connection, translation.ref)).toBe(translated);
        await translated.call('editing_describe', {
            query: {
                ref: translation.ref,
            },
        });
        const saved = await translated.call<{ content: Record<string, unknown> }>('editing_collections_update_draft', {
            params: {
                name: 'offices',
                id: 'oslo',
            },
            body: {
                changes: {},
            },
        });
        expect(calls[2]).toEqual([
            'editing_collections_update_draft',
            {
                params: {
                    name: 'offices',
                    id: 'oslo',
                },
                body: {
                    changes: {},
                },
                query: {
                    locale: 'nb',
                },
            },
        ]);
        expect(saved.body.content).toEqual({
            name: 'Hagen Oslo',
            city: 'Oslo sentrum',
        });
        await translated.call('editing_collections_list_items', {
            params: {
                name: 'offices',
            },
        });
        expect(calls[3]).toEqual([
            'editing_collections_list_items',
            {
                params: {
                    name: 'offices',
                },
            },
        ]);
    });

    it('addresses a translation as its document with its language', () => {
        setAdminPath('/admin');
        expect(refInLocale('item:offices:oslo', 'nb', 'en')).toBe('item:offices:oslo@nb');
        expect(refInLocale('page:norway:frontPage@en', 'nb', 'nb')).toBe('page:norway:frontPage');
        const href = hrefIn(undefined, {
            kind: 'document',
            ref: 'item:offices:oslo@nb',
        });
        expect(href).toBe('/admin/collections/offices/oslo@nb');
        expect(screenOf(href)).toEqual({
            kind: 'document',
            ref: 'item:offices:oslo@nb',
        });
    });

    it('reads where each copy stands on its tab', () => {
        expect(localeStatusOf({ code: 'nb', status: 'empty', sourceChanged: 0 }, false)).toBe('Not translated');
        expect(localeStatusOf({ code: 'nb', status: 'published', sourceChanged: 2 }, false)).toBe('Source changed');
        expect(localeStatusOf({ code: 'nb', status: 'changed', sourceChanged: 0 }, false)).toBe('Unpublished changes');
        expect(localeStatusOf({ code: 'en', status: 'published', sourceChanged: 0 }, true)).toBe('Published');
    });
});
