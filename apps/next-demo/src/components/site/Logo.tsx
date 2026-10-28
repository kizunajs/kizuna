import styles from './Logo.module.css';

/**
 * A leaf beside the shop's name, one lockup that links home.
 */
export function Logo() {
    return (
        <a href="/" className={styles.logo}>
            <svg className={styles.mark} viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2.5 17.5C2.5 9.2 7.6 3.2 17.5 2.5c-.6 9.6-6.4 15-15 15Z" fill="currentColor" />
                <path d="M3.5 16.5 11.5 8.5" fill="none" stroke="var(--logo-vein, var(--paper))" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Hagen
        </a>
    );
}
