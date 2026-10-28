import kizuna from '@kizuna-config';
import { optional } from '../lib/optional';
import { Logo } from './Logo';
import styles from './Header.module.css';

export async function Header() {
    const header = await optional(() => kizuna.content.globals.header.get());

    return (
        <>
            {header?.announcement === undefined ? null : <p className={styles.announcement}>{header.announcement}</p>}
            <header className={styles.header}>
                <div className={styles.inner}>
                    <Logo />
                    <nav className={styles.nav} aria-label="Main">
                        {(header?.navItems ?? []).map((item) => (
                            <a key={item.href} href={item.href} className={styles.link}>
                                {item.label}
                            </a>
                        ))}
                    </nav>
                </div>
            </header>
        </>
    );
}
