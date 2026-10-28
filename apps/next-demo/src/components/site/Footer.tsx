import kizuna from '@kizuna-config';
import { optional } from '../../lib/optional';
import { Emphasis } from '../Emphasis';
import { NewsletterForm } from '../newsletter/NewsletterForm';
import { Logo } from './Logo';
import styles from './Footer.module.css';

/**
 * Where to go from this demo, kept in code since they belong to the demo
 * rather than to the shop.
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
            {footer?.newsletterHeading === undefined || !footer.showNewsletter ? null : (
                <section className={styles.newsletter} aria-label="Newsletter">
                    <h2 className={styles.newsletterHeading}>
                        <Emphasis text={footer.newsletterHeading} />
                    </h2>
                    <div className={styles.newsletterBody}>
                        {footer.newsletterText === undefined ? null : <p className={styles.newsletterText}>{footer.newsletterText}</p>}
                        <NewsletterForm />
                    </div>
                </section>
            )}
            <div className={styles.main}>
                <div className={styles.brand}>
                    <Logo />
                    {footer === undefined ? null : <p className={styles.tagline}>{footer.tagline}</p>}
                </div>
                {footer === undefined ? null : (
                    <>
                        <div className={styles.column}>
                            <h2 className={styles.columnTitle}>Visit</h2>
                            <p>{footer.address}</p>
                            {footer.openingHours.length === 0 ? null : (
                                <dl className={styles.hours}>
                                    {footer.openingHours.map((row) => (
                                        <div key={row.days} className={styles.hoursRow}>
                                            <dt>{row.days}</dt>
                                            <dd>{row.hours}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </div>
                        <div className={styles.column}>
                            <h2 className={styles.columnTitle}>Contact</h2>
                            <a href={`tel:${footer.phone.replace(/[^+\d]/g, '')}`} className={styles.link}>
                                {footer.phone}
                            </a>
                            <a href={`mailto:${footer.contactEmail}`} className={styles.link}>
                                {footer.contactEmail}
                            </a>
                        </div>
                        {footer.navItems.length === 0 ? null : (
                            <div className={styles.column}>
                                <h2 className={styles.columnTitle}>Explore</h2>
                                {footer.navItems.map((item) => (
                                    <a key={item.href} href={item.href} className={styles.link}>
                                        {item.label}
                                    </a>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
            <div className={styles.meta}>
                <p>© 2026 Hagen Planter AS</p>
                <nav className={styles.demo} aria-label="Kizuna demo">
                    {demoLinks.map((item) => (
                        <a key={item.href} href={item.href} className={styles.link}>
                            {item.label}
                        </a>
                    ))}
                </nav>
            </div>
        </footer>
    );
}
