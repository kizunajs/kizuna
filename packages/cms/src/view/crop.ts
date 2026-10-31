/**
 * A crop as an image reference stores it: the kept area, as fractions of the
 * original from its top left corner.
 */
export interface Crop {
    x: number;
    y: number;
    width: number;
    height: number;
}

const fraction = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

/**
 * A shape like `16:9` as width over height, or `undefined` when it is not two
 * positive numbers.
 */
export const ratioOf = (aspectRatio: string): number | undefined => {
    const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspectRatio);
    if (match === null) return undefined;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? width / height : undefined;
};

/**
 * The largest crop of a shape an original this size holds, centred on the
 * focal point as far as the edges allow, or on the middle without one.
 */
export const defaultCrop = (ratio: number, focalPoint: { x: number; y: number } | undefined, width: number, height: number): Crop => {
    const focal = focalPoint ?? {
        x: 0.5,
        y: 0.5,
    };
    const wide = width / height > ratio;
    const keptWidth = wide ? (height * ratio) / width : 1;
    const keptHeight = wide ? 1 : width / ratio / height;
    const place = (centre: number, length: number): number => Math.min(1 - length, Math.max(0, centre - length / 2));
    return {
        x: fraction(place(focal.x, keptWidth)),
        y: fraction(place(focal.y, keptHeight)),
        width: fraction(keptWidth),
        height: fraction(keptHeight),
    };
};

/**
 * Whether a crop of an original this size has the shape, to within a pixel.
 */
export const fitsRatio = (crop: Crop, ratio: number, width: number, height: number): boolean => {
    const keptWidth = crop.width * width;
    const keptHeight = crop.height * height;
    return Math.abs(keptWidth / ratio - keptHeight) <= 1.5;
};

/**
 * Which part of the frame is dragged: the whole frame, or one corner.
 */
export type CropHandle = 'move' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const SMALLEST = 0.05;

/**
 * The crop after dragging a handle by a distance, as fractions of the
 * original. With a shape, a corner keeps it; the frame stays inside the image
 * and the opposite corner stays put.
 */
export const dragCrop = (
    start: Crop,
    handle: CropHandle,
    distance: { x: number; y: number },
    shape: { ratio: number; width: number; height: number } | undefined
): Crop => {
    if (handle === 'move') {
        return {
            ...start,
            x: fraction(Math.min(1 - start.width, Math.max(0, start.x + distance.x))),
            y: fraction(Math.min(1 - start.height, Math.max(0, start.y + distance.y))),
        };
    }
    const left = handle.endsWith('left');
    const top = handle.startsWith('top');
    const anchorX = left ? start.x + start.width : start.x;
    const anchorY = top ? start.y + start.height : start.y;
    const roomX = left ? anchorX : 1 - anchorX;
    const roomY = top ? anchorY : 1 - anchorY;
    let keptWidth = Math.min(roomX, Math.max(SMALLEST, start.width + (left ? -distance.x : distance.x)));
    let keptHeight = Math.min(roomY, Math.max(SMALLEST, start.height + (top ? -distance.y : distance.y)));
    if (shape !== undefined) {
        // In fractions, the shape's width over height scales by the original's height over its width.
        const across = (shape.ratio * shape.height) / shape.width;
        keptHeight = keptWidth / across;
        if (keptHeight > roomY) {
            keptHeight = roomY;
            keptWidth = keptHeight * across;
        }
    }
    return {
        x: fraction(left ? anchorX - keptWidth : anchorX),
        y: fraction(top ? anchorY - keptHeight : anchorY),
        width: fraction(keptWidth),
        height: fraction(keptHeight),
    };
};
