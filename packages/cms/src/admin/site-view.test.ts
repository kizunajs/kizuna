import { describe, expect, it } from 'vitest';
import { fieldsInSite, hasPerSiteFields, isShared, type SiteField } from './site-view.js';

const field = (name: string, extra: Partial<SiteField> = {}): SiteField => ({
    path: name,
    name,
    readOnly: false,
    required: false,
    writable: true,
    schema: {
        type: 'string',
    },
    ...extra,
});

const OFFICE: SiteField[] = [
    field('address'),
    field('phone', {
        perSite: {
            shared: '+44 20 0000 0000',
        },
    }),
    field('openingHours', {
        perSite: {},
    }),
];

describe("a site's view of shared content", () => {
    it('tells shared content from a page or a site of its own', () => {
        expect(isShared('item:offices:k3j9x2')).toBe(true);
        expect(isShared('global:privacyPolicy')).toBe(true);
        expect(isShared('item:uk:events:e1')).toBe(false);
        expect(isShared('page:uk:frontPage')).toBe(false);
    });

    it("shows only the fields a site gives its own value, over the shared one, marked with the site's label", () => {
        const shown = fieldsInSite(
            OFFICE,
            {
                openingHours: 'Mon to Fri, 08:00 to 16:00',
            },
            'Hagen UK'
        );
        expect(shown.map((candidate) => [candidate.path, candidate.help, candidate.schema['default']])).toEqual([
            ['phone', 'Hagen UK', '+44 20 0000 0000'],
            ['openingHours', 'Hagen UK. Clear it to show the shared value.', undefined],
        ]);
    });

    it('marks the fields a site may override in the shared view, and leaves the rest', () => {
        const shown = fieldsInSite(OFFICE, null, undefined);
        expect(shown.map((candidate) => candidate.help)).toEqual([
            undefined,
            'Shared. Each site may set its own.',
            'Shared. Each site may set its own.',
        ]);
    });

    it('edits as one site does while describe marks no field per site', () => {
        const plain = [field('address'), field('phone')];
        expect(hasPerSiteFields(plain)).toBe(false);
        expect(fieldsInSite(plain, null, undefined)).toEqual(plain);
    });
});
