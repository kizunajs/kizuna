import { humanize } from '../view/schema.js';

/**
 * An uploaded image as the library lists it, with how many documents hold it.
 */
export interface MediaItem {
    id: string;
    url: string;
    contentType: string;
    size: number;
    width: number;
    height: number;
    filename: string;
    alt: string;
    focalPoint?: {
        x: number;
        y: number;
    };
    uploadedAt: string;
    uploadedBy: string;
    uses: number;
    /**
     * The site the image belongs to, or none for a shared image.
     */
    site?: string;
    /**
     * The folder of its library it sits in, or none at the top level.
     */
    folder?: string;
}

/**
 * A folder of one library, as the library lists it.
 */
export interface MediaFolderItem {
    id: string;
    name: string;
    parent?: string;
    /**
     * The site whose library holds it, or none in the shared library.
     */
    site?: string;
    /**
     * How many images it holds itself.
     */
    images: number;
}

/**
 * One document that holds an image, from `editing_media_uses`.
 */
export interface MediaUse {
    ref: string;
    /**
     * The site the document belongs to, or none for shared content.
     */
    site?: string;
    label: string | null;
    locales: string[];
    fieldPaths: string[];
    published: boolean;
}

const FORMATS: Record<string, string> = {
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/webp': 'WebP',
    'image/gif': 'GIF',
    'image/avif': 'AVIF',
};

/**
 * The file's format as editors name it: JPEG, PNG, WebP.
 */
export const formatOf = (contentType: string): string => FORMATS[contentType] ?? contentType.replace(/^image\//, '').toUpperCase();

/**
 * A file's size in the units people read: "640 KB", "1.8 MB".
 */
export const bytesOf = (bytes: number): string => {
    if (bytes < 1000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
    const megabytes = bytes / 1_000_000;
    return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
};

/**
 * How a tile says where an image is used: "Unused", "Used in 1 place".
 */
export const usageOf = (uses: number): string => (uses === 0 ? 'Unused' : `Used in ${uses} ${uses === 1 ? 'place' : 'places'}`);

/**
 * The orders the library sorts by, the newest upload first by default.
 */
export const MEDIA_SORTS = [
    {
        key: 'newest',
        label: 'Newest',
    },
    {
        key: 'oldest',
        label: 'Oldest',
    },
    {
        key: 'name',
        label: 'Name',
    },
    {
        key: 'largest',
        label: 'Largest',
    },
];

/**
 * Which images show: all of them, or the ones nothing uses.
 */
export type MediaScope = 'all' | 'unused';

export interface MediaFilter {
    query: string;
    scope: MediaScope;
    /**
     * A content type to keep, or `undefined` for every format.
     */
    format: string | undefined;
    sort: string;
}

/**
 * The images the search, scope and format keep, in the order picked. The
 * search looks in the file name and the alt text.
 */
export const shownMedia = (items: readonly MediaItem[], filter: MediaFilter): MediaItem[] => {
    const words = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const kept = items.filter(
        (item) =>
            (filter.scope === 'all' || item.uses === 0) &&
            (filter.format === undefined || item.contentType === filter.format) &&
            words.every((word) => `${item.filename} ${item.alt}`.toLowerCase().includes(word))
    );
    const byName = (left: MediaItem, right: MediaItem): number => left.filename.localeCompare(right.filename);
    if (filter.sort === 'name') return kept.sort(byName);
    if (filter.sort === 'largest') return kept.sort((left, right) => right.size - left.size || byName(left, right));
    const direction = filter.sort === 'oldest' ? 1 : -1;
    return kept.sort((left, right) => direction * left.uploadedAt.localeCompare(right.uploadedAt) || byName(left, right));
};

/**
 * The formats the library holds, in the order editors know them, for the
 * Type menu.
 */
export const formatsIn = (items: readonly MediaItem[]): Array<{ contentType: string; label: string }> =>
    [...new Set(items.map((item) => item.contentType))]
        .map((contentType) => ({
            contentType,
            label: formatOf(contentType),
        }))
        .sort((left, right) => left.label.localeCompare(right.label));

/**
 * The field holding an image, as a use reads it: `hero.image` is "Hero,
 * Image", and a list's index is left out, so `body.2.image` is "Body, Image".
 */
export const fieldLabelOf = (fieldPath: string): string =>
    fieldPath
        .split('.')
        .filter((segment) => !/^\d+$/.test(segment))
        .map(humanize)
        .join(', ');

/**
 * A focal point as the details say it: "42% across, 58% down".
 */
export const focalTextOf = (point: { x: number; y: number }): string =>
    `${Math.round(point.x * 100)}% across, ${Math.round(point.y * 100)}% down`;

/**
 * Where a click lands on the preview, as a focal point of fractions rounded
 * to hundredths and kept inside the image.
 */
export const focalPointAt = (
    click: { x: number; y: number },
    box: { left: number; top: number; width: number; height: number }
): { x: number; y: number } => {
    const fraction = (offset: number, length: number): number =>
        length <= 0 ? 0.5 : Math.min(1, Math.max(0, Math.round((offset / length) * 100) / 100));
    return {
        x: fraction(click.x - box.left, box.width),
        y: fraction(click.y - box.top, box.height),
    };
};

/**
 * What Delete asks of an image nothing holds.
 */
export const deleteQuestionOf = (filename: string): string => `Delete ${filename}? Nothing uses it.`;

/**
 * The title of the dialog that lists what holds an image, when it cannot be
 * deleted or moved.
 */
export const heldTitleOf = (filename: string, uses: number, outside?: string): string =>
    outside === undefined ? `${filename} is ${usageOf(uses).toLowerCase()}` : `${filename} is used outside ${outside}`;

/**
 * The folders directly inside `parent` of one library, or at its top level
 * without one, by name.
 */
export const foldersAt = (folders: readonly MediaFolderItem[], parent: string | undefined, site: string | undefined): MediaFolderItem[] =>
    folders.filter((folder) => folder.site === site && folder.parent === parent).sort((left, right) => left.name.localeCompare(right.name));

/**
 * The folders from the top level down to `id`, for the path bar.
 */
export const folderTrail = (folders: readonly MediaFolderItem[], id: string | undefined): MediaFolderItem[] => {
    const trail: MediaFolderItem[] = [];
    for (let step = folders.find((folder) => folder.id === id); step !== undefined && !trail.includes(step); ) {
        trail.unshift(step);
        const parent: string | undefined = step.parent;
        step = folders.find((folder) => folder.id === parent);
    }
    return trail;
};

/**
 * The line under a folder's name: what it holds.
 */
export const folderDetailOf = (folder: MediaFolderItem, folders: readonly MediaFolderItem[]): string => {
    const inner = folders.filter((candidate) => candidate.parent === folder.id).length;
    const parts = [
        ...(inner === 0 ? [] : [`${inner} ${inner === 1 ? 'folder' : 'folders'}`]),
        ...(folder.images === 0 ? [] : [`${folder.images} ${folder.images === 1 ? 'image' : 'images'}`]),
    ];
    return parts.length === 0 ? 'Empty' : parts.join(', ');
};

/**
 * The images a library shows in one folder, or at its top level. A search,
 * or Unused, looks in every folder instead, so `everywhere` keeps them all.
 */
export const imagesAt = (
    items: readonly MediaItem[],
    place: { site: string | undefined; folder: string | undefined; everywhere: boolean }
): MediaItem[] => (place.everywhere ? [...items] : items.filter((item) => item.site === place.site && item.folder === place.folder));

/**
 * Uses grouped under the site they belong to, in the order the sites are
 * declared, with shared content last.
 */
export const usesBySite = (
    uses: readonly MediaUse[],
    siteOrder: readonly string[]
): Array<{ site: string | undefined; uses: MediaUse[] }> => {
    const groups = new Map<string | undefined, MediaUse[]>();
    for (const use of uses) groups.set(use.site, [...(groups.get(use.site) ?? []), use]);
    const rank = (site: string | undefined): number =>
        site === undefined ? siteOrder.length + 1 : siteOrder.indexOf(site) === -1 ? siteOrder.length : siteOrder.indexOf(site);
    return [...groups.entries()]
        .sort(([left], [right]) => rank(left) - rank(right))
        .map(([site, held]) => ({
            site,
            uses: held,
        }));
};

/**
 * Where Move can send images: each library's top level and folders, nested
 * under their parents.
 */
export interface MoveDestination {
    site: string | undefined;
    folder: string | undefined;
    name: string;
    depth: number;
}

/**
 * The places of one library as Move lists them: its top level, then its
 * folders, each under its parent.
 */
export const destinationsIn = (folders: readonly MediaFolderItem[], site: string | undefined): MoveDestination[] => {
    const rows: MoveDestination[] = [
        {
            site,
            folder: undefined,
            name: 'Top level',
            depth: 0,
        },
    ];
    const add = (parent: string | undefined, depth: number): void => {
        for (const folder of foldersAt(folders, parent, site)) {
            rows.push({
                site,
                folder: folder.id,
                name: folder.name,
                depth,
            });
            add(folder.id, depth + 1);
        }
    };
    add(undefined, 0);
    return rows;
};
