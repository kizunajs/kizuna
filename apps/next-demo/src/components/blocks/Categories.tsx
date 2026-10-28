import type { Output } from '@kizunajs/cms';
import type { CategoriesBlockSchema } from '../../cms/blocks';
import { sizedImage } from '../../lib/image';
import { Emphasis } from '../Emphasis';
import { Eyebrow } from '../Eyebrow';
import styles from './Categories.module.css';

/**
 * Ways into the shop, each a tall photo with its name set over it.
 */
export function Categories({ eyebrow, heading, categories }: Output<typeof CategoriesBlockSchema>) {
    return (
        <section className={styles.section}>
            <div className={styles.header}>
                <Eyebrow text={eyebrow} />
                <h2 className={styles.heading}>
                    <Emphasis text={heading} />
                </h2>
            </div>
            <ul className={styles.tiles}>
                {categories.map((category) => (
                    <li key={category.name} className={styles.tile}>
                        <a href={category.href} className={styles.link}>
                            <img
                                className={styles.image}
                                src={sizedImage(category.image.url, 900, 1200)}
                                alt={category.image.alt}
                                width={900}
                                height={1200}
                                loading="lazy"
                            />
                            <span className={styles.label}>
                                <span className={styles.name}>{category.name}</span>
                                <span className={styles.discover}>→ Discover</span>
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
