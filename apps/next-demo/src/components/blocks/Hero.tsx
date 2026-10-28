import type { Output } from '@kizunajs/cms';
import type { HeroBlockSchema } from '../../cms/blocks';
import { sizedImage } from '../../lib/image';
import { LinkButton } from '../LinkButton';
import styles from './Hero.module.css';

type HeroProps = Omit<Output<typeof HeroBlockSchema>, 'links'> & {
    links?: Output<typeof HeroBlockSchema>['links'];
    /**
     * A line above the heading, like an article's topic.
     */
    eyebrow?: React.ReactNode;
    /**
     * What follows the subheading, like an article's author and date.
     */
    children?: React.ReactNode;
};

const SIZES = {
    high: {
        width: 1920,
        height: 900,
    },
    medium: {
        width: 1200,
        height: 900,
    },
};

/**
 * The top of a page. A high hero sets the heading over the image, a medium one
 * beside it, and a low one shows the heading alone.
 */
export function Hero({ impact, heading, subheading, image, links = [], eyebrow, children }: HeroProps) {
    const shown = impact === 'low' ? undefined : image;
    const size = SIZES[impact === 'high' ? 'high' : 'medium'];

    return (
        <section className={`${styles.hero} ${styles[impact]} ${shown === undefined ? styles.plain : ''}`}>
            {shown === undefined ? null : (
                <img
                    className={styles.image}
                    src={sizedImage(shown.url, size.width, size.height)}
                    alt={shown.alt}
                    width={size.width}
                    height={size.height}
                />
            )}
            <div className={styles.text}>
                {eyebrow === undefined ? null : <p className={styles.eyebrow}>{eyebrow}</p>}
                <h1 className={styles.heading}>{heading}</h1>
                {subheading === '' ? null : <p className={styles.subheading}>{subheading}</p>}
                {children}
                {links.length === 0 ? null : (
                    <div className={styles.links}>
                        {links.map((link, index) => (
                            <LinkButton
                                key={link.href}
                                href={link.href}
                                label={link.label}
                                variant={index === 0 ? 'primary' : 'secondary'}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
