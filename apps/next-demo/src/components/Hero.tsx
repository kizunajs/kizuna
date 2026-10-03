import type { Output } from '@kizunajs/cms';
import type { HeroBlockSchema } from '../cms/blocks';

/**
 * The hero image cropped short and wide around its focal point, so moving the
 * focus in the editor moves what the crop keeps.
 */
const HERO_WIDTH = 1600;
const HERO_HEIGHT = 560;

const heroSource = (url: string): string => {
    const parsed = new URL(url, 'http://image.local');
    parsed.searchParams.set('w', String(HERO_WIDTH));
    parsed.searchParams.set('h', String(HERO_HEIGHT));
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

export function Hero(props: Output<typeof HeroBlockSchema>) {
    return (
        <section
            style={{
                display: 'grid',
                gap: '1rem',
                marginBottom: '2rem',
            }}>
            {props.image !== undefined ? (
                <img
                    src={heroSource(props.image.url)}
                    alt={props.image.alt}
                    width={HERO_WIDTH}
                    height={HERO_HEIGHT}
                    style={{
                        width: '100%',
                        height: 'auto',
                    }}
                />
            ) : null}
            <h1
                style={{
                    margin: 0,
                }}>
                {props.heading}
            </h1>
            <p
                style={{
                    margin: 0,
                    color: '#555',
                }}>
                {props.subheading}
            </p>
            <a
                href={props.cta.href}
                style={{
                    justifySelf: 'start',
                    padding: '0.6rem 1rem',
                    background: '#111',
                    color: '#fff',
                    textDecoration: 'none',
                    borderRadius: '0.4rem',
                }}>
                {props.cta.label}
            </a>
        </section>
    );
}
