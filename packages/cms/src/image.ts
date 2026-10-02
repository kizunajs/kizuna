import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { readMetaId, unwrapOptionalWrappers } from 'kizunajs/generator';

const fraction = z.number().min(0).max(1);

/**
 * A rectangle of the original image, each edge a fraction of its size.
 */
export const CropSchema = z
    .object({
        x: fraction.describe('The left edge, as a fraction of the width.'),
        y: fraction.describe('The top edge, as a fraction of the height.'),
        width: fraction.describe('The width, as a fraction of the original width.'),
        height: fraction.describe('The height, as a fraction of the original height.'),
    })
    .describe('The part of the original to show, as fractions of its size.');

/**
 * The point to keep in view when an image is cropped to another shape.
 */
export const FocalPointSchema = z
    .object({
        x: fraction.describe('Across, from the left edge, as a fraction of the width.'),
        y: fraction.describe('Down, from the top edge, as a fraction of the height.'),
    })
    .describe('The point to keep in view when the image is cropped to fit.');

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
    title: 'CmsImage',
    description: 'An uploaded image, with the crop, focal point and alt text for this use of it.',
    schema: z.object({
        id: z.string().min(1).describe('The media id of the uploaded file.'),
        alt: z.string().describe('What the image shows, for people who cannot see it. Empty for a decorative image.'),
        crop: CropSchema.optional(),
        focalPoint: FocalPointSchema.optional(),
    }),
}).brand<'CmsImage'>();

/**
 * An image as a field stores it.
 */
export type ImageRef = z.output<typeof ImageSchema>;

/**
 * An image as the page component receives it: the URL and size with the crop
 * applied.
 */
export interface ResolvedImage {
    id: string;
    url: string;
    alt: string;
    width: number;
    height: number;
}

/**
 * Whether a schema is `ImageSchema`, read through `.optional()` and
 * `.default()`.
 */
export const isImageSchema = (schema: z.core.$ZodType): boolean =>
    readMetaId(schema) === 'CmsImage' || readMetaId(unwrapOptionalWrappers(schema).inner) === 'CmsImage';
