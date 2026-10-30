import { describe, expect, it } from 'vitest';
import type { Description, DescribedField } from '../view/schema.js';
import { isShared, sharedNameOf, siteValuesRefOf, withSharedFields } from './site-view.js';

const field = (name: string, belongsTo: string, extra: Partial<DescribedField> = {}): DescribedField => ({
    path: name,
    name,
    readOnly: false,
    required: false,
    writable: true,
    schema: {
        type: 'string',
    },
    belongsTo,
    ...extra,
});

const described = (ref: string, fields: DescribedField[], draft: Record<string, unknown>): Description =>
    ({
        ref,
        kind: 'item',
        name: 'offices',
        path: null,
        fields,
        layout: [],
        draft,
    }) as unknown as Description;

describe("a site's values on shared content", () => {
    it('tells shared content from a page or a site of its own', () => {
        expect(isShared('item:offices:k3j9x2')).toBe(true);
        expect(isShared('global:privacyPolicy')).toBe(true);
        expect(isShared('item:uk:events:e1')).toBe(false);
        expect(isShared('page:uk:frontPage')).toBe(false);
        expect(sharedNameOf('item:offices:k3j9x2')).toBe('offices');
        expect(sharedNameOf('global:privacyPolicy')).toBe('privacyPolicy');
        expect(sharedNameOf('item:uk:events:e1')).toBeUndefined();
    });

    it('keeps them where the CMS stores them, under the site', () => {
        expect(siteValuesRefOf('item:offices:k3j9x2', 'uk')).toBe('item:uk:offices:k3j9x2');
        expect(siteValuesRefOf('global:privacyPolicy', 'uk')).toBe('global:uk:privacyPolicy');
    });

    it("shows every shared field locked around the site's own, which leaves an empty one empty", () => {
        const shared = described('item:offices:k3j9x2', [field('name', 'Shared'), field('address', 'Shared'), field('phone', 'Shared')], {
            name: 'Harbour Office',
            address: '12 Harbour Street',
            phone: '+44 20 0000 0100',
        });
        const values = described(
            'item:uk:offices:k3j9x2',
            [
                field('phone', 'Hagen UK', {
                    sharedValue: '+44 20 0000 0100',
                }),
                field('openingHours', 'Hagen UK'),
            ],
            {
                openingHours: 'Mon to Fri, 08:00 to 16:00',
            }
        );
        const shown = withSharedFields(values, shared);
        expect(shown.ref).toBe('item:uk:offices:k3j9x2');
        expect(shown.fields.map((candidate) => [candidate.path, candidate.belongsTo, candidate.writable])).toEqual([
            ['name', 'Shared', false],
            ['address', 'Shared', false],
            ['phone', 'Hagen UK', true],
            ['openingHours', 'Hagen UK', true],
        ]);
        expect(shown.draft).toEqual({
            name: 'Harbour Office',
            address: '12 Harbour Street',
            openingHours: 'Mon to Fri, 08:00 to 16:00',
        });
    });
});
