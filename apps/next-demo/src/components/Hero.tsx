import type { Output } from '@kizunajs/cms';
import type { HeroBlockSchema } from '../cms/blocks';

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
                    src={props.image.url}
                    alt={props.image.alt}
                    width={props.image.width}
                    height={props.image.height}
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
