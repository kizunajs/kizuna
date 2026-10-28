import styles from './LinkButton.module.css';

/**
 * A link that looks like a button. The first of a row is `primary`, the rest
 * `secondary`.
 */
export function LinkButton({ href, label, variant }: { href: string; label: string; variant: 'primary' | 'secondary' }) {
    return (
        <a href={href} className={`${styles.button} ${styles[variant]}`}>
            {label}
        </a>
    );
}
