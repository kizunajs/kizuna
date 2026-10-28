import kizuna from '@kizuna-config';
import { optional } from '../lib/optional';
import { Logo } from './Logo';
import styles from './Footer.module.css';

/**
 * Where to go from this demo, beside the shop's own links. Kept in code, since
 * they belong to the demo rather than to the shop.
 */
const demoLinks = [
    {
        label: 'Edit content',
        href: '/admin',
    },
    {
        label: 'Edit in your chat',
        href: '/cms',
    },
    {
        label: 'API demo',
        href: '/demo',
    },
    {
        label: 'API reference',
        href: '/api/docs',
    },
];

export async function Footer() {
    const footer = await optional(() => kizuna.content.globals.footer.get());

    return (
        <footer className={styles.footer}>
            <div className={styles.inner}>
                <div className={styles.brand}>
                    <Logo />
                    {footer === undefined ? null : <p className={styles.tagline}>{footer.tagline}</p>}
                </div>
                <div className={styles.columns}>
                    {footer === undefined ? null : (
                        <>
                            <div>
                                <h2 className={styles.columnTitle}>Shop</h2>
                                <ul className={styles.list}>
                                    {footer.navItems.map((item) => (
                                        <li key={item.href}>
                                            <a href={item.href} className={styles.link}>
                                                {item.label}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <h2 className={styles.columnTitle}>Visit</h2>
                                <ul className={styles.list}>
                                    <li>{footer.address}</li>
                                    <li>{footer.openingHours}</li>
                                    <li>
                                        <a href={`tel:${footer.phone.replace(/[^+\d]/g, '')}`} className={styles.link}>
                                            {footer.phone}
                                        </a>
                                    </li>
                                    <li>
                                        <a href={`mailto:${footer.contactEmail}`} className={styles.link}>
                                            {footer.contactEmail}
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        </>
                    )}
                    <div>
                        <h2 className={styles.columnTitle}>Demo</h2>
                        <ul className={styles.list}>
                            {demoLinks.map((item) => (
                                <li key={item.href}>
                                    <a href={item.href} className={styles.link}>
                                        {item.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            <p className={styles.meta}>A demo shop built with Kizuna. The plants, people and prices are made up.</p>
        </footer>
    );
}
