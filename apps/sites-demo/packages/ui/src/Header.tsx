import Link from 'next/link';
import styles from './Header.module.css';

export interface HeaderLink {
    label: string;
    href: string;
}

/**
 * The site's icon, name and menu, at the top of every page.
 */
export function Header({ label, icon, links }: { label: string; icon: string; links: HeaderLink[] }) {
    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                <Link href="/" className={styles.brand}>
                    <img className={styles.icon} src={icon} alt="" width={30} height={30} />
                    {label}
                </Link>
                <nav aria-label="Main">
                    <ul className={styles.nav}>
                        {links.map((link) => (
                            <li key={link.href}>
                                <a className={styles.link} href={link.href}>
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </header>
    );
}
