import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { readMeta, readMetaId, unwrapOptionalWrappers } from 'kizunajs/generator';
import { describedForAgents } from './field.js';
import { ratioOf } from './view/crop.js';

const fraction = z.number().min(0).max(1);

/**
 * A rectangle of the original image, each edge a fraction of its size.
 */
export const CropSchema = describedForAgents(
    z
        .object({
            x: fraction.describe('The left edge, as a fraction of the width.'),
            y: fraction.describe('The top edge, as a fraction of the height.'),
            width: fraction.describe('The width, as a fraction of the original width.'),
            height: fraction.describe('The height, as a fraction of the original height.'),
        })
        .describe('The part of the original to show, as fractions of its size.')
);

/**
 * The point to keep in view when an image is cropped to another shape.
 */
export const FocalPointSchema = describedForAgents(
    z
        .object({
            x: fraction.describe('Across, from the left edge, as a fraction of the width.'),
            y: fraction.describe('Down, from the top edge, as a fraction of the height.'),
        })
        .describe('The point to keep in view when the image is cropped to fit.')
);

/**
 * A reference to an uploaded image, with how this use of it is shown. The file
 * is stored once and untouched; the crop, focal point and alt text belong to
 * the field, so a page's crop never changes the same image elsewhere.
 *
 * @example
 * {
 *     name: 'image',
 *     schema: ImageSchema,
 * },
 */
export const ImageSchema = Kizuna.model({
    title: 'CMS.Image',
    description: 'An uploaded image, with the crop, focal point and alt text for this use of it.',
    schema: z.object({
        id: z.string().min(1).describe('The media id of the uploaded file.'),
        alt: z.string().describe('What the image shows, for people who cannot see it. Empty for a decorative image.'),
        crop: CropSchema.optional(),
        focalPoint: FocalPointSchema.optional(),
    }),
}).brand<'CMS.Image'>();

/**
 * An image as a field stores it.
 */
export type ImageRef = z.output<typeof ImageSchema>;

/**
 * A shape as width and height, like `16:9`.
 */
export type AspectRatio = `${number}:${number}`;

/**
 * The shape a `croppedImage` field crops to: one aspect ratio, or a crop of
 * its own for each name.
 */
export type CropShape =
    | {
          aspectRatio: AspectRatio;
      }
    | {
          crops: Record<string, AspectRatio>;
      };

/**
 * One named crop as the page component receives it.
 */
export interface ResolvedCrop {
    url: string;
    width: number;
    height: number;
}

/**
 * An image as the page component receives it: the URL and size with the crop
 * applied. A field with named crops adds each under `crops`, and its own `url`
 * is the whole image.
 */
export interface ResolvedImage {
    id: string;
    url: string;
    alt: string;
    width: number;
    height: number;
}

const IMAGE_KIND = 'image';

const imageFields = {
    id: z.string().min(1).describe('The media id of the uploaded file.'),
    alt: z.string().describe('What the image shows, for people who cannot see it. Empty for a decorative image.'),
};

const assertRatio = (aspectRatio: string, owner: string): void => {
    if (ratioOf(aspectRatio) === undefined) {
        throw new Error(`croppedImage takes ${owner} like '16:9', two positive numbers, not '${aspectRatio}'.`);
    }
};

/**
 * An image field cropped to a shape for each use. With `aspectRatio`, the
 * editor's crop keeps that shape and the page reads `url`, `width` and
 * `height` cropped to it. With `crops`, the editor crops each name in turn and
 * the page reads `crops.<name>`. A crop nobody set is the largest part of the
 * shape around the focal point.
 *
 * @example
 * {
 *     name: 'hero',
 *     schema: croppedImage({
 *         aspectRatio: '16:9',
 *     }),
 * },
 */
export function croppedImage(options: { aspectRatio: AspectRatio }): z.ZodType<ImageRef, ImageRef>;
export function croppedImage<const Crops extends Record<string, AspectRatio>>(options: {
    crops: Crops;
}): z.ZodType<CroppedImageRef<Crops>, CroppedImageRef<Crops>>;
export function croppedImage(options: CropShape): z.ZodType {
    if ('aspectRatio' in options) {
        assertRatio(options.aspectRatio, 'an aspectRatio');
        return describedForAgents(
            z
                .object({
                    ...imageFields,
                    crop: CropSchema.optional().describe(`The part of the original to show, in the shape ${options.aspectRatio}.`),
                    focalPoint: FocalPointSchema.optional(),
                })
                .meta({
                    'x-kizuna': IMAGE_KIND,
                    'x-kizuna-crop': {
                        aspectRatio: options.aspectRatio,
                    },
                    description: `An uploaded image cropped to ${options.aspectRatio}, with the focal point and alt text for this use of it.`,
                })
        );
    }
    const names = Object.keys(options.crops);
    if (names.length === 0) throw new Error('croppedImage takes at least one crop under `crops`.');
    const shape: Record<string, z.ZodType> = {};
    for (const name of names) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name))
            throw new Error(`croppedImage names a crop '${name}'. A crop's name is letters and digits.`);
        assertRatio(options.crops[name]!, `the crop '${name}'`);
        shape[name] = CropSchema.optional().describe(`The ${name} crop, in the shape ${options.crops[name]}.`);
    }
    return describedForAgents(
        z
            .object({
                ...imageFields,
                crops: z.object(shape).optional().describe('Each named crop, as fractions of the original.'),
                focalPoint: FocalPointSchema.optional(),
            })
            .meta({
                'x-kizuna': IMAGE_KIND,
                'x-kizuna-crop': {
                    crops: options.crops,
                },
                description: `An uploaded image with a crop of its own for ${names.join(' and ')}, with the focal point and alt text for this use of it.`,
            })
    );
}

/**
 * A `croppedImage` field with named crops, as it stores them.
 */
export type CroppedImageRef<Crops extends Record<string, AspectRatio>> = {
    id: string;
    alt: string;
    crops?: {
        [Name in keyof Crops]?: z.output<typeof CropSchema>;
    };
    focalPoint?: z.output<typeof FocalPointSchema>;
} & z.core.$brand<'CMS.Image'>;

/**
 * Whether a schema is an image field, `ImageSchema` or `croppedImage`, read
 * through `.optional()` and `.default()`.
 */
export const isImageSchema = (schema: z.core.$ZodType): boolean => {
    const inner = unwrapOptionalWrappers(schema).inner;
    return (
        readMetaId(schema) === 'CMS.Image' ||
        readMetaId(inner) === 'CMS.Image' ||
        readMeta(schema)?.['x-kizuna'] === IMAGE_KIND ||
        readMeta(inner)?.['x-kizuna'] === IMAGE_KIND
    );
};

/**
 * The shape a `croppedImage` field crops to, or `undefined` for `ImageSchema`.
 */
export const cropShapeOf = (schema: z.core.$ZodType): CropShape | undefined => {
    const shape = readMeta(schema)?.['x-kizuna-crop'] ?? readMeta(unwrapOptionalWrappers(schema).inner)?.['x-kizuna-crop'];
    return typeof shape === 'object' && shape !== null ? (shape as CropShape) : undefined;
};
