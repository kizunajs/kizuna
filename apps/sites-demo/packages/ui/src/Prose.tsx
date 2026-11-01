import type { ReactNode } from 'react';
import styles from './Prose.module.css';

/**
 * Plain text as paragraphs, split at each blank line, or rendered rich text
 * as `children`.
 */
export function Prose({ text, children }: { text?: string; children?: ReactNode }) {
    return (
        <div className={styles.prose}>
            {children ?? (text ?? '').split(/\n\s*\n/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
    );
}
