import kizuna from '@kizuna-config';
import { optional } from '../../lib/optional';
import { Logo } from './Logo';
import styles from './Header.module.css';

/**
 * The announcement band and the menu. Over a page that opens on a full photo,
 * the menu sits on the photo in light text.
 */
export async function Header() {
    const header = await optional(() => kizuna.content.globals.header.get());
    const announcement = header?.showAnnouncement === false ? undefined : header?.announcement;

    return (
        <div className={styles.top}>
            {announcement === undefined || announcement === '' ? null : (
                <p className={styles.announcement}>
                    <span>{announcement}</span>
                    {header?.announcementLink === undefined ? null : (
                        <a href={header.announcementLink.href} className={styles.announcementLink}>
                            {header.announcementLink.label}
                        </a>
                    )}
                </p>
            )}
            <header className={styles.header}>
                <div className={styles.inner}>
                    <Logo />
                    {(header?.navItems ?? []).length === 0 ? null : (
                        <nav className={styles.nav} aria-label="Main">
                            {header?.navItems.map((item) => (
                                <a key={item.href} href={item.href} className={styles.link}>
                                    {item.label}
                                </a>
                            ))}
                        </nav>
                    )}
                </div>
            </header>
        </div>
    );
}
