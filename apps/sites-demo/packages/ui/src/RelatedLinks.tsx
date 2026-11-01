import styles from './RelatedLinks.module.css';

/**
 * A link as the CMS reads it: its address, or `null` while its page is not
 * published, and its words.
 */
export interface RelatedLink {
    href: string | null;
    label?: string;
}

/**
 * Links to other pages under a heading, each one plain text while its page
 * is not published.
 */
export function RelatedLinks({ heading, links }: { heading: string; links: readonly RelatedLink[] }) {
    if (links.length === 0) return null;
    return (
        <nav className={styles.related} aria-label={heading}>
            <h2 className={styles.heading}>{heading}</h2>
            <ul className={styles.list}>
                {links.map((link) => (
                    <li key={`${link.label}:${link.href}`}>
                        {link.href === null ? link.label : <a href={link.href}>{link.label ?? link.href}</a>}
                    </li>
                ))}
            </ul>
        </nav>
    );
}
