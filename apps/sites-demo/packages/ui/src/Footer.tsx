import styles from './Footer.module.css';

export interface FooterLink {
    label: string;
    href: string;
}

/**
 * The company behind the site, in the green band at the bottom of every page.
 */
export function Footer({ companyName, links }: { companyName: string; links: FooterLink[] }) {
    return (
        <footer className={styles.footer}>
            <div className={styles.inner}>
                <p className={styles.company}>{companyName}</p>
                <ul className={styles.links}>
                    {links.map((link) => (
                        <li key={link.href}>
                            <a href={link.href}>{link.label}</a>
                        </li>
                    ))}
                </ul>
            </div>
        </footer>
    );
}
