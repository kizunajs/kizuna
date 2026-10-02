import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { inspectImage, NotAnImageError, renderImage, stripMetadata } from './inspect.js';

const image = (width: number, height: number) =>
    sharp({
        create: {
            width,
            height,
            channels: 3,
            background: {
                r: 40,
                g: 40,
                b: 40,
            },
        },
    });

const withExif = async (): Promise<Uint8Array> =>
    new Uint8Array(
        await image(320, 200)
            .jpeg()
            .withExif({
                IFD0: {
                    ImageDescription: 'taken somewhere private',
                },
            })
            .toBuffer()
    );

describe('inspectImage', () => {
    it('reads the type and size from the bytes', async () => {
        const png = new Uint8Array(await image(64, 48).png().toBuffer());
        expect(await inspectImage(png)).toMatchObject({
            format: 'png',
            contentType: 'image/png',
            extension: 'png',
            width: 64,
            height: 48,
            hasExif: false,
        });
        const webp = new Uint8Array(await image(10, 20).webp().toBuffer());
        expect((await inspectImage(webp)).contentType).toBe('image/webp');
    });

    it('refuses SVG and anything that is not an image, whatever it is called', async () => {
        await expect(inspectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toBeInstanceOf(
            NotAnImageError
        );
        await expect(inspectImage(new TextEncoder().encode('hello'))).rejects.toBeInstanceOf(NotAnImageError);
    });

    it('notices EXIF', async () => {
        expect((await inspectImage(await withExif())).hasExif).toBe(true);
    });
});

describe('stripMetadata', () => {
    it('removes EXIF and keeps the image', async () => {
        const stripped = await stripMetadata(await withExif(), await inspectImage(await withExif()));
        const inspected = await inspectImage(stripped);
        expect(inspected.hasExif).toBe(false);
        expect(inspected).toMatchObject({
            width: 320,
            height: 200,
        });
    });

    it('leaves a file without metadata as it was', async () => {
        const png = new Uint8Array(await image(8, 8).png().toBuffer());
        expect(await stripMetadata(png, await inspectImage(png))).toBe(png);
    });
});

describe('renderImage', () => {
    it('applies the crop and sizes to the width asked for, as WebP', async () => {
        const source = new Uint8Array(await image(400, 200).png().toBuffer());
        const rendered = await renderImage(
            source,
            {
                width: 400,
                height: 200,
            },
            {
                crop: {
                    x: 0,
                    y: 0,
                    width: 0.5,
                    height: 1,
                },
                width: 100,
            }
        );
        expect(await inspectImage(rendered)).toMatchObject({
            format: 'webp',
            width: 100,
            height: 100,
        });
    });

    it('fits a different shape around the focal point', async () => {
        const source = new Uint8Array(await image(400, 200).png().toBuffer());
        const rendered = await renderImage(
            source,
            {
                width: 400,
                height: 200,
            },
            {
                focalPoint: {
                    x: 0.9,
                    y: 0.5,
                },
                width: 100,
                height: 100,
            }
        );
        expect(await inspectImage(rendered)).toMatchObject({
            width: 100,
            height: 100,
        });
    });
});
