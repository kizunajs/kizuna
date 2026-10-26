import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import styles from './migration-banner.module.css';

export function MigrationBanner() {
    return (
        <aside className={styles.banner} aria-label="Migration">
            <Link className={styles.link} href="/docs/migration/from-ts-rest">
                <span>
                    Coming from ts-rest?<span className={styles.bodyLong}> Kizuna.js is an alternative with a familiar API.</span>
                </span>
                <span className={styles.action}>
                    Migration guide
                    <ArrowRight className={styles.icon} aria-hidden />
                </span>
            </Link>
        </aside>
    );
}
