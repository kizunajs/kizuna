import type { ReactNode } from 'react';
import styles from './comparison.module.css';

/**
 * Two code blocks beside each other, the same thing written both ways.
 */
export function SideBySide({ children }: { children: ReactNode }) {
    return <div className={styles.sideBySide}>{children}</div>;
}
