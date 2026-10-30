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
}

/**
 * One document that holds an image, from `editing_media_uses`.
 */
export interface MediaUse {
    ref: string;
    label: string | null;
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
 * How a tile says where an image is used: "Unused", "Used on 1 page".
 */
export const usageOf = (uses: number): string => (uses === 0 ? 'Unused' : `Used on ${uses} ${uses === 1 ? 'page' : 'pages'}`);

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
 * What Delete asks, saying how many pages lose the image.
 */
export const deleteQuestionOf = (filename: string, uses: number): string =>
    uses === 0
        ? `Delete ${filename}? Nothing uses it.`
        : `Delete ${filename}? ${uses === 1 ? '1 page uses' : `${uses} pages use`} it and will lose the image.`;
