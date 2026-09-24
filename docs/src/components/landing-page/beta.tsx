import clsx from 'clsx';
import Link from 'next/link';
import { Badge } from '@/components/shared/badge';
import styles from './beta.module.css';

export function Beta({ className }: { className?: string }) {
    return (
        <div className={clsx(styles.beta, className)}>
            <Badge stage="beta" size="medium" />
            <p className={styles.body}>
                <span className={styles.bodyLong}>
                    Battle-tested in production. v2 is in beta, so pin your version and read the release notes between releases.
                </span>
                <span className={styles.bodyShort}>Battle-tested in prod.</span>
            </p>
            <Link className={styles.link} href="/faq">
                Read the FAQ
            </Link>
        </div>
    );
}
