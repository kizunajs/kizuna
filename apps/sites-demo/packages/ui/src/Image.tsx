/**
 * An image the CMS serves, sized by its own route.
 */
export interface Image {
    url: string;
    alt: string;
    width: number;
    height: number;
}

/**
 * The image at `width` by `height`, cropped by the CMS around its focal point.
 */
export function CmsImage({ image, width, height, className }: { image: Image; width: number; height: number; className?: string }) {
    const url = new URL(image.url, 'http://image.local');
    url.searchParams.set('w', String(width * 2));
    url.searchParams.set('h', String(height * 2));
    const src = /^https?:\/\//.test(image.url) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
    return <img className={className} src={src} alt={image.alt} width={width} height={height} />;
}
