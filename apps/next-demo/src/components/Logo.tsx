import styles from './Logo.module.css';

/**
 * The shop's name beside a leaf.
 */
export function Logo() {
    return (
        <a href="/" className={styles.logo}>
            <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M5 19 13 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Hagen
        </a>
    );
}
