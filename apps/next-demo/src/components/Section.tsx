import styles from './Section.module.css';

/**
 * One band of a page, centred at the site's width, with an optional heading.
 */
export function Section({
    heading,
    id,
    width = 'wide',
    tight = false,
    children,
}: {
    heading?: string;
    id?: string;
    width?: 'wide' | 'narrow';
    /**
     * A smaller gap above, for the band right under a page's heading.
     */
    tight?: boolean;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className={`${styles.section} ${width === 'narrow' ? styles.narrow : ''} ${tight ? styles.tight : ''}`}>
            {heading === undefined ? null : <h2 className={styles.heading}>{heading}</h2>}
            {children}
        </section>
    );
}
