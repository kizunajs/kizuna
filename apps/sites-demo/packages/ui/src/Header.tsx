import styles from './Header.module.css';

export interface HeaderLink {
    label: string;
    href: string;
}

/**
 * The site's icon, name and menu, at the top of every page. `home` is the
 * front page in the language shown.
 */
export function Header({ label, icon, home = '/', links }: { label: string; icon: string; home?: string; links: HeaderLink[] }) {
    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                <a href={home} className={styles.brand}>
                    <img className={styles.icon} src={icon} alt="" width={30} height={30} />
                    {label}
                </a>
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
