import sharp, { type Metadata } from 'sharp';

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'avif';

/**
 * The image types the CMS accepts, by what sharp reads from the bytes.
 */
const ACCEPTED: Record<ImageFormat, { contentType: string; extension: string }> = {
    jpeg: {
        contentType: 'image/jpeg',
        extension: 'jpg',
    },
    png: {
        contentType: 'image/png',
        extension: 'png',
    },
    webp: {
        contentType: 'image/webp',
        extension: 'webp',
    },
    gif: {
        contentType: 'image/gif',
        extension: 'gif',
    },
    avif: {
        contentType: 'image/avif',
        extension: 'avif',
    },
};

export interface InspectedImage {
    format: ImageFormat;
    contentType: string;
    extension: string;
    width: number;
    height: number;
    /**
     * Whether the file carries EXIF, where a camera writes the location.
     */
    hasExif: boolean;
}

/**
 * Why the bytes were refused.
 */
export class NotAnImageError extends Error {}

/**
 * What the bytes are, read by sharp rather than from the name or the declared
 * type. SVG is refused: it is a document that can carry script.
 */
const looksLikeSvg = (bytes: Uint8Array): boolean => {
    const head = new TextDecoder('utf-8', {
        fatal: false,
    })
        .decode(bytes.subarray(0, 2048))
        .trimStart()
        .toLowerCase();
    return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
};

export const inspectImage = async (bytes: Uint8Array): Promise<InspectedImage> => {
    if (looksLikeSvg(bytes)) throw new NotAnImageError('SVG is not accepted. Upload a JPEG, PNG, WebP, GIF or AVIF.');
    let metadata: Metadata;
    try {
        metadata = await sharp(bytes).metadata();
    } catch {
        throw new NotAnImageError('The file is not an image sharp can read. Upload a JPEG, PNG, WebP, GIF or AVIF.');
    }
    if (metadata.format === 'svg') throw new NotAnImageError('SVG is not accepted. Upload a JPEG, PNG, WebP, GIF or AVIF.');
    if (!(metadata.format in ACCEPTED)) {
        throw new NotAnImageError(`${metadata.format ?? 'This file type'} is not accepted. Upload a JPEG, PNG, WebP, GIF or AVIF.`);
    }
    const format = metadata.format as ImageFormat;
    const sideways = (metadata.orientation ?? 1) >= 5;
    return {
        format,
        ...ACCEPTED[format],
        width: (sideways ? metadata.height : metadata.width) ?? 0,
        height: (sideways ? metadata.width : metadata.height) ?? 0,
        hasExif: metadata.exif !== undefined,
    };
};

/**
 * The same image without its EXIF, XMP and other metadata, with the
 * orientation EXIF described baked into the pixels. Only a file that carries
 * metadata is re-encoded; the rest is stored as uploaded.
 */
export const stripMetadata = async (bytes: Uint8Array, inspected: InspectedImage): Promise<Uint8Array> => {
    if (!inspected.hasExif) return bytes;
    const image = sharp(bytes, {
        animated: inspected.format === 'gif' || inspected.format === 'webp',
    })
        .rotate()
        .keepIccProfile();
    switch (inspected.format) {
        case 'jpeg':
            return new Uint8Array(await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer());
        case 'png':
            return new Uint8Array(await image.png().toBuffer());
        case 'webp':
            return new Uint8Array(await image.webp({ quality: 92 }).toBuffer());
        case 'gif':
            return new Uint8Array(await image.gif().toBuffer());
        case 'avif':
            return new Uint8Array(await image.avif({ quality: 70 }).toBuffer());
    }
};

export interface RenderOptions {
    crop?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    focalPoint?: {
        x: number;
        y: number;
    };
    width?: number;
    height?: number;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * The image as a page shows it: the stored crop applied, then fitted to the
 * requested size, keeping the focal point in view when the shape changes, and
 * encoded as WebP. The stored file is never altered.
 */
export const renderImage = async (
    bytes: Uint8Array,
    source: { width: number; height: number },
    options: RenderOptions
): Promise<Uint8Array> => {
    let image = sharp(bytes).rotate();
    let region = {
        left: 0,
        top: 0,
        width: source.width,
        height: source.height,
    };
    if (options.crop !== undefined) {
        region = {
            left: Math.round(options.crop.x * source.width),
            top: Math.round(options.crop.y * source.height),
            width: Math.max(1, Math.round(options.crop.width * source.width)),
            height: Math.max(1, Math.round(options.crop.height * source.height)),
        };
    }
    if (options.width !== undefined && options.height !== undefined) {
        const wanted = options.width / options.height;
        const current = region.width / region.height;
        const focal = options.focalPoint ?? {
            x: 0.5,
            y: 0.5,
        };
        if (current > wanted) {
            const width = Math.round(region.height * wanted);
            const centre = region.left + focal.x * region.width;
            region = {
                ...region,
                left: Math.round(clamp(centre - width / 2, region.left, region.left + region.width - width)),
                width,
            };
        } else if (current < wanted) {
            const height = Math.round(region.width / wanted);
            const centre = region.top + focal.y * region.height;
            region = {
                ...region,
                top: Math.round(clamp(centre - height / 2, region.top, region.top + region.height - height)),
                height,
            };
        }
    }
    const whole = region.left === 0 && region.top === 0 && region.width === source.width && region.height === source.height;
    if (!whole) image = image.extract(region);
    if (options.width !== undefined || options.height !== undefined) {
        image = image.resize({
            width: options.width,
            height: options.height,
            fit: options.width !== undefined && options.height !== undefined ? 'fill' : 'inside',
            withoutEnlargement: true,
        });
    }
    return new Uint8Array(await image.webp({ quality: 82 }).toBuffer());
};
