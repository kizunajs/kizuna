import type { API } from '../../lib/api-client.generated';
import { formatKroner } from '../../lib/format';
import { BrowseRange } from '../BrowseRange';
import { Section } from '../Section';
import styles from './Products.module.css';

/**
 * The products a page picked, as the shop's API returned them, and the whole
 * range under them.
 */
export function Products({ heading, products }: { heading: string; products: API.Product[] }) {
    return (
        <Section heading={heading} id="shop">
            <ul className={styles.grid}>
                {products.map((product) => (
                    <li key={product.id} className={styles.item}>
                        <span className={styles.name}>{product.name}</span>
                        <span className={styles.price}>{formatKroner(product.price)}</span>
                    </li>
                ))}
            </ul>
            <BrowseRange />
        </Section>
    );
}
