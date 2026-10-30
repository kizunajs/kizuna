import { OfficeCard, type Office } from './OfficeCard';
import styles from './OfficeList.module.css';

/**
 * Every shop, side by side.
 */
export function OfficeList({ offices }: { offices: Array<Office & { id: string }> }) {
    return (
        <div className={styles.list}>
            {offices.map((office) => (
                <OfficeCard key={office.id} office={office} />
            ))}
        </div>
    );
}
