import type { ReactNode } from 'react';
import type { Output } from '@kizunajs/cms';
import type { HeroBlockSchema } from '../../cms/blocks';
import { sizedImage } from '../../lib/image';
import { Emphasis } from '../Emphasis';
import { Eyebrow } from '../Eyebrow';
import { LinkRow } from '../ButtonLink';
import styles from './Hero.module.css';

type Props = Partial<Output<typeof HeroBlockSchema>> &
    Pick<Output<typeof HeroBlockSchema>, 'heading'> & {
        impact?: 'high' | 'medium' | 'low';
        /**
         * More under the heading, like a page's own filters.
         */
        children?: ReactNode;
    };

/**
 * The top of a page in three sizes. `high` lays the heading over a photo that
 * fills the window, `medium` sets it beside a tall photo, and `low` sets it
 * alone. Without a photo, every size is `low`.
 */
export function Hero({ impact = 'high', eyebrow, heading, subheading, image, caption, links = [], children }: Props) {
    const text = (
        <>
            <Eyebrow text={eyebrow} />
            <h1 className={styles.heading}>
                <Emphasis text={heading} />
            </h1>
            {subheading === undefined ? null : <p className={styles.subheading}>{subheading}</p>}
            <LinkRow links={links} />
            {children}
        </>
    );

    if (image === undefined || impact === 'low') {
        return (
            <section className={styles.low}>
                <div className={styles.lowText}>{text}</div>
            </section>
        );
    }

    if (impact === 'medium') {
        return (
            <section className={styles.medium}>
                <div className={styles.mediumText}>{text}</div>
                <figure className={styles.mediumFigure}>
                    <img className={styles.mediumImage} src={sizedImage(image.url, 1000, 1250)} alt={image.alt} width={1000} height={1250} />
                    {caption === undefined ? null : <figcaption className={styles.mediumCaption}>{caption}</figcaption>}
                </figure>
            </section>
        );
    }

    return (
        <section className={styles.high} data-hero="high">
            <img
                className={styles.highImage}
                src={sizedImage(image.url, 1600, 1000)}
                alt={image.alt}
                width={1600}
                height={1000}
                fetchPriority="high"
            />
            <div className={styles.highText}>{text}</div>
            {caption === undefined ? null : <p className={styles.highCaption}>{caption}</p>}
        </section>
    );
}
