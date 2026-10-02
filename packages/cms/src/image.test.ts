import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readMetaId } from 'kizunajs/generator';
import { ImageSchema, isImageSchema } from './image.js';

describe('ImageSchema', () => {
    it('is a named model', () => {
        expect(readMetaId(ImageSchema)).toBe('CmsImage');
    });

    it('stores a media id, alt text and per-use overrides', () => {
        expect(
            ImageSchema.safeParse({
                id: 'media_1',
                alt: 'Tulips in a field',
                crop: {
                    x: 0.1,
                    y: 0,
                    width: 0.8,
                    height: 1,
                },
                focalPoint: {
                    x: 0.5,
                    y: 0.3,
                },
            }).success
        ).toBe(true);
    });

    it('keeps crop and focal point within the image', () => {
        expect(
            ImageSchema.safeParse({
                id: 'media_1',
                alt: '',
                crop: {
                    x: 0,
                    y: 0,
                    width: 1.2,
                    height: 1,
                },
            }).success
        ).toBe(false);
    });

    it('requires alt text and a media id', () => {
        expect(
            ImageSchema.safeParse({
                id: '',
                alt: 'Tulips',
            }).success
        ).toBe(false);
        expect(
            ImageSchema.safeParse({
                id: 'media_1',
            }).success
        ).toBe(false);
    });

    it('is recognised through .optional()', () => {
        expect(isImageSchema(ImageSchema)).toBe(true);
        expect(isImageSchema(ImageSchema.optional())).toBe(true);
        expect(isImageSchema(z.string())).toBe(false);
    });
});
