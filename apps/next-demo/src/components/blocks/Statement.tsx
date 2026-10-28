import type { Output } from '@kizunajs/cms';
import type { StatementBlockSchema } from '../../cms/blocks';
import { sizedImage } from '../../lib/image';
import { Emphasis } from '../Emphasis';
import { Eyebrow } from '../Eyebrow';
import { ButtonLink } from '../ButtonLink';
import styles from './Statement.module.css';

/**
 * One sentence set large, with a row of small photos under it.
 */
export function Statement({ eyebrow, text, images, link }: Output<typeof StatementBlockSchema>) {
    return (
        <section className={styles.section}>
            <Eyebrow text={eyebrow} />
            <h2 className={styles.text}>
                <Emphasis text={text} />
            </h2>
            {images.length === 0 && link === undefined ? null : (
                <div className={styles.footer}>
                    {images.length === 0 ? null : (
                        <ul className={styles.images}>
                            {images.map((image) => (
                                <li key={image.id}>
                                    <img
                                        className={styles.image}
                                        src={sizedImage(image.url, 400, 500)}
                                        alt={image.alt}
                                        width={400}
                                        height={500}
                                        loading="lazy"
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                    {link === undefined ? null : <ButtonLink href={link.href} label={link.label} variant="arrow" />}
                </div>
            )}
        </section>
    );
}
