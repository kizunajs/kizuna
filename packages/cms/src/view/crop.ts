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

/**
 * A crop as the editor reads it: the pixels trimmed from each edge of the
 * original.
 */
export interface CropEdges {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

const fraction = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

/**
 * The pixels a crop trims from each edge of an original this size.
 */
export const edgesOf = (crop: Crop | undefined, width: number, height: number): CropEdges => {
    const kept = crop ?? {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
    };
    return {
        top: Math.round(kept.y * height),
        right: Math.round((1 - kept.x - kept.width) * width),
        bottom: Math.round((1 - kept.y - kept.height) * height),
        left: Math.round(kept.x * width),
    };
};

/**
 * The crop that trims these pixels from an original this size, or
 * `undefined` when it trims nothing. Edges that meet keep one pixel.
 */
export const cropOf = (edges: CropEdges, width: number, height: number): Crop | undefined => {
    if (width <= 0 || height <= 0) return undefined;
    const left = Math.max(0, Math.min(edges.left, width - 1));
    const top = Math.max(0, Math.min(edges.top, height - 1));
    const right = Math.max(0, Math.min(edges.right, width - left - 1));
    const bottom = Math.max(0, Math.min(edges.bottom, height - top - 1));
    if (left === 0 && top === 0 && right === 0 && bottom === 0) return undefined;
    return {
        x: fraction(left / width),
        y: fraction(top / height),
        width: fraction((width - left - right) / width),
        height: fraction((height - top - bottom) / height),
    };
};
