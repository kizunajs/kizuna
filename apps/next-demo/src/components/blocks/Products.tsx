import type { API } from '../../lib/api-client.generated';
import { catalogueEntry } from '../../lib/catalogue';
import { formatKroner } from '../../lib/format';
import { Emphasis } from '../Emphasis';
import { Eyebrow } from '../Eyebrow';
import { ButtonLink } from '../ButtonLink';
import styles from './Products.module.css';

interface Props {
    eyebrow?: string;
    heading: string;
    link?: {
        label: string;
        href: string;
    };
    products: API.Product[];
}

/**
 * The products a page picked, as the shop's API returned them, four to a row
 * with every other column set lower. The price sits small on the photo.
 */
export function Products({ eyebrow, heading, link, products }: Props) {
    return (
        <section className={styles.section} id="shop">
            <div className={styles.header}>
                <div className={styles.titles}>
                    <Eyebrow text={eyebrow} />
                    <h2 className={styles.heading}>
                        <Emphasis text={heading} />
                    </h2>
                </div>
                {link === undefined ? null : <ButtonLink href={link.href} label={link.label} variant="arrow" />}
            </div>
            {products.length === 0 ? (
                <p className={styles.empty}>The shelves are being restocked. Check back in a moment.</p>
            ) : (
                <ul className={styles.grid}>
                    {products.map((product) => {
                        const entry = catalogueEntry(product.id);
                        return (
                            <li key={product.id} className={styles.product}>
                                <div className={styles.picture}>
                                    {entry?.photo === undefined ? (
                                        <div className={styles.placeholder} aria-hidden="true">
                                            <svg viewBox="0 0 20 20" className={styles.placeholderMark}>
                                                <path d="M2.5 17.5C2.5 9.2 7.6 3.2 17.5 2.5c-.6 9.6-6.4 15-15 15Z" fill="currentColor" />
                                            </svg>
                                        </div>
                                    ) : (
                                        <img
                                            className={styles.photo}
                                            src={entry.photo}
                                            alt={product.name}
                                            width={800}
                                            height={1000}
                                            loading="lazy"
                                        />
                                    )}
                                    <span className={styles.price}>{formatKroner(product.price)}</span>
                                </div>
                                <h3 className={styles.name}>{product.name}</h3>
                                {entry === undefined ? null : (
                                    <>
                                        <p className={styles.botanical}>{entry.botanicalName}</p>
                                        <p className={styles.size}>{entry.size}</p>
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
