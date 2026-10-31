import { describe, expect, it } from 'vitest';
import {
    bytesOf,
    deleteQuestionOf,
    destinationsIn,
    fieldLabelOf,
    folderDetailOf,
    folderTrail,
    foldersAt,
    focalPointAt,
    focalTextOf,
    formatsIn,
    heldTitleOf,
    imagesAt,
    shownMedia,
    usageOf,
    usesBySite,
    type MediaFilter,
    type MediaFolderItem,
    type MediaItem,
    type MediaUse,
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
        expect(usageOf(1)).toBe('Used in 1 place');
        expect(usageOf(3)).toBe('Used in 3 places');
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

    it('asks before deleting an image nothing holds, and says what holds one that cannot go', () => {
        expect(deleteQuestionOf('watering-can.jpg')).toBe('Delete watering-can.jpg? Nothing uses it.');
        expect(heldTitleOf('skog-stammer.jpg', 6)).toBe('skog-stammer.jpg is used in 6 places');
        expect(heldTitleOf('skog-stammer.jpg', 1)).toBe('skog-stammer.jpg is used in 1 place');
        expect(heldTitleOf('skog-stammer.jpg', 0, 'Hagen Norge')).toBe('skog-stammer.jpg is used outside Hagen Norge');
    });
});

const folder = (id: string, name: string, overrides: Partial<MediaFolderItem> = {}): MediaFolderItem => ({
    id,
    name,
    images: 0,
    ...overrides,
});

describe('media folders', () => {
    const folders = [
        folder('fld_kampanjer', 'Kampanjer', {
            site: 'norway',
            images: 2,
        }),
        folder('fld_jul', 'Jul 2026', {
            site: 'norway',
            parent: 'fld_kampanjer',
            images: 2,
        }),
        folder('fld_var', 'Vår 2026', {
            site: 'norway',
            parent: 'fld_kampanjer',
            images: 1,
        }),
        folder('fld_butikkene', 'Butikkene', {
            site: 'norway',
            images: 3,
        }),
        folder('fld_ansatte', 'Ansatte', {
            images: 4,
        }),
        folder('fld_tomt', 'Tomt', {
            site: 'norway',
        }),
    ];

    it("lists a library's folders at one level, by name", () => {
        expect(foldersAt(folders, undefined, 'norway').map((each) => each.name)).toEqual(['Butikkene', 'Kampanjer', 'Tomt']);
        expect(foldersAt(folders, 'fld_kampanjer', 'norway').map((each) => each.name)).toEqual(['Jul 2026', 'Vår 2026']);
        expect(foldersAt(folders, undefined, undefined).map((each) => each.name)).toEqual(['Ansatte']);
    });

    it('leads from the top level down to a folder', () => {
        expect(folderTrail(folders, 'fld_jul').map((each) => each.name)).toEqual(['Kampanjer', 'Jul 2026']);
        expect(folderTrail(folders, undefined)).toEqual([]);
    });

    it('says what a folder holds', () => {
        expect(folderDetailOf(folders[0]!, folders)).toBe('2 folders, 2 images');
        expect(folderDetailOf(folders[2]!, folders)).toBe('1 image');
        expect(folderDetailOf(folders[5]!, folders)).toBe('Empty');
    });

    it('shows the images of one folder, or of every folder while searching', () => {
        const images = [
            item('kirsebaer.jpg', {
                site: 'norway',
                folder: 'fld_var',
            }),
            item('bregner.jpg', {
                site: 'norway',
            }),
            item('skog-stammer.jpg', {}),
        ];
        const names = (shown: MediaItem[]): string[] => shown.map((each) => each.filename);
        expect(
            names(
                imagesAt(images, {
                    site: 'norway',
                    folder: undefined,
                    everywhere: false,
                })
            )
        ).toEqual(['bregner.jpg']);
        expect(
            names(
                imagesAt(images, {
                    site: 'norway',
                    folder: 'fld_var',
                    everywhere: false,
                })
            )
        ).toEqual(['kirsebaer.jpg']);
        expect(
            imagesAt(images, {
                site: 'norway',
                folder: undefined,
                everywhere: true,
            })
        ).toHaveLength(3);
    });

    it("offers each library's top level and folders, nested, to move into", () => {
        expect(destinationsIn(folders, 'norway').map((each) => `${'  '.repeat(each.depth)}${each.name}`)).toEqual([
            'Top level',
            'Butikkene',
            'Kampanjer',
            '  Jul 2026',
            '  Vår 2026',
            'Tomt',
        ]);
    });
});

describe('usesBySite', () => {
    it('groups uses under their site in the declared order, shared content last', () => {
        const use = (ref: string, site?: string): MediaUse => ({
            ref,
            ...(site === undefined
                ? {}
                : {
                      site,
                  }),
            label: null,
            locales: [],
            fieldPaths: ['hero'],
            published: true,
        });
        const groups = usesBySite(
            [
                use('item:articles:winter'),
                use('page:uk:frontPage', 'uk'),
                use('page:norway:eventsPage', 'norway'),
                use('page:group:frontPage', 'group'),
            ],
            ['group', 'uk', 'norway']
        );
        expect(groups.map((group) => group.site)).toEqual(['group', 'uk', 'norway', undefined]);
    });
});
