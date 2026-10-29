import { describe, expect, it } from 'vitest';
import {
    bytesOf,
    deleteQuestionOf,
    fieldLabelOf,
    focalPointAt,
    focalTextOf,
    formatsIn,
    shownMedia,
    usageOf,
    type MediaFilter,
    type MediaItem,
} from './media-library.js';

const item = (filename: string, overrides: Partial<MediaItem>): MediaItem => ({
    id: `med_${filename}`,
    url: `/api/cms/content/media/med_${filename}/image`,
    contentType: 'image/jpeg',
    size: 1000,
    width: 2400,
    height: 1600,
    filename,
    alt: '',
    uploadedAt: '2026-10-01T10:00:00.000Z',
    uploadedBy: 'ada',
    uses: 1,
    ...overrides,
});

const library = [
    item('forest-path.jpg', {
        alt: 'A path through spruce and ferns',
        size: 1_800_000,
        uploadedAt: '2026-10-12T10:00:00.000Z',
        uses: 3,
    }),
    item('terracotta-pots.webp', {
        contentType: 'image/webp',
        size: 420_000,
        uploadedAt: '2026-09-04T10:00:00.000Z',
        uses: 0,
    }),
    item('fern-shelf.png', {
        contentType: 'image/png',
        alt: 'Three Boston ferns on a shelf',
        size: 1_100_000,
        uploadedAt: '2026-10-02T10:00:00.000Z',
    }),
];

const names = (items: readonly MediaItem[]): string[] => items.map((candidate) => candidate.filename);

describe('the media library', () => {
    it('lists the newest upload first, and sorts by age, name or size', () => {
        const filter: Omit<MediaFilter, 'sort'> = {
            query: '',
            scope: 'all',
            format: undefined,
        };
        expect(
            names(
                shownMedia(library, {
                    ...filter,
                    sort: 'newest',
                })
            )
        ).toEqual(['forest-path.jpg', 'fern-shelf.png', 'terracotta-pots.webp']);
        expect(
            names(
                shownMedia(library, {
                    ...filter,
                    sort: 'oldest',
                })
            )
        ).toEqual(['terracotta-pots.webp', 'fern-shelf.png', 'forest-path.jpg']);
        expect(
            names(
                shownMedia(library, {
                    ...filter,
                    sort: 'name',
                })
            )
        ).toEqual(['fern-shelf.png', 'forest-path.jpg', 'terracotta-pots.webp']);
        expect(
            names(
                shownMedia(library, {
                    ...filter,
                    sort: 'largest',
                })
            )
        ).toEqual(['forest-path.jpg', 'fern-shelf.png', 'terracotta-pots.webp']);
    });

    it('finds images by file name or alt text, and keeps the unused ones or one format', () => {
        expect(
            names(
                shownMedia(library, {
                    query: 'ferns',
                    scope: 'all',
                    format: undefined,
                    sort: 'name',
                })
            )
        ).toEqual(['fern-shelf.png', 'forest-path.jpg']);
        expect(
            names(
                shownMedia(library, {
                    query: '',
                    scope: 'unused',
                    format: undefined,
                    sort: 'name',
                })
            )
        ).toEqual(['terracotta-pots.webp']);
        expect(
            names(
                shownMedia(library, {
                    query: '',
                    scope: 'all',
                    format: 'image/png',
                    sort: 'name',
                })
            )
        ).toEqual(['fern-shelf.png']);
    });

    it('offers the formats the library holds, by name', () => {
        expect(formatsIn(library).map((format) => format.label)).toEqual(['JPEG', 'PNG', 'WebP']);
    });

    it('writes sizes, uses and fields the way people read them', () => {
        expect(bytesOf(640_000)).toBe('640 KB');
        expect(bytesOf(1_840_000)).toBe('1.8 MB');
        expect(bytesOf(412_000_000)).toBe('412 MB');
        expect(usageOf(0)).toBe('Unused');
        expect(usageOf(1)).toBe('Used on 1 page');
        expect(usageOf(3)).toBe('Used on 3 pages');
        expect(fieldLabelOf('hero.image')).toBe('Hero, Image');
        expect(fieldLabelOf('body.2.image')).toBe('Body, Image');
        expect(fieldLabelOf('coverImage')).toBe('Cover image');
    });

    it('sets the focal point where the click lands, kept inside the image', () => {
        const box = {
            left: 100,
            top: 50,
            width: 400,
            height: 200,
        };
        expect(
            focalPointAt(
                {
                    x: 268,
                    y: 166,
                },
                box
            )
        ).toEqual({
            x: 0.42,
            y: 0.58,
        });
        expect(
            focalPointAt(
                {
                    x: 40,
                    y: 400,
                },
                box
            )
        ).toEqual({
            x: 0,
            y: 1,
        });
        expect(
            focalTextOf({
                x: 0.42,
                y: 0.58,
            })
        ).toBe('42% across, 58% down');
    });

    it('says how many pages lose an image before deleting it', () => {
        expect(deleteQuestionOf('watering-can.jpg', 0)).toBe('Delete watering-can.jpg? Nothing uses it.');
        expect(deleteQuestionOf('felix-lund.jpg', 1)).toBe('Delete felix-lund.jpg? 1 page uses it and will lose the image.');
        expect(deleteQuestionOf('forest-path.jpg', 3)).toBe('Delete forest-path.jpg? 3 pages use it and will lose the image.');
    });
});
