import styles from './ButtonLink.module.css';

/**
 * A link set as a button, or as a plain link with an arrow. A band or a photo
 * sets `--button` and `--button-ink` for the buttons inside it.
 */
export function ButtonLink({ href, label, variant = 'button' }: { href: string; label: string; variant?: 'button' | 'arrow' }) {
    return (
        <a href={href} className={variant === 'button' ? styles.button : styles.arrow}>
            {label}
        </a>
    );
}

/**
 * Up to two links in a row: the first a button, the second a plain link.
 */
export function LinkRow({ links }: { links: Array<{ label: string; href: string }> }) {
    if (links.length === 0) return null;
    return (
        <div className={styles.row}>
            {links.map((link, index) => (
                <ButtonLink key={link.href} href={link.href} label={link.label} variant={index === 0 ? 'button' : 'arrow'} />
            ))}
        </div>
    );
}
