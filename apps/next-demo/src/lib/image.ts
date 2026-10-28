/**
 * An image URL from the CMS cropped to a size around its focal point, so
 * moving the focus in the editor moves what the crop keeps. The fragment the
 * preview reads in draft mode stays on the end.
 */
export const sizedImage = (url: string, width: number, height: number): string => {
    const parsed = new URL(url, 'http://image.local');
    parsed.searchParams.set('w', String(width));
    parsed.searchParams.set('h', String(height));
    return /^https?:\/\//.test(url) ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
};
