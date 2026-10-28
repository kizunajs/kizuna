import type { Metadata } from 'next';
import kizuna from '@kizuna-config';
import { sendContactMessage } from './actions';
import { Hero } from '../../components/blocks/Hero';
import { PersonTile } from '../../components/PersonTile';
import { optional } from '../../lib/optional';
import { listOf } from '../../lib/stored';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
    const content = await kizuna.content.pages.contactPage.get();
    return {
        title: content.seo?.title ?? 'Contact',
        description: content.seo?.description ?? content.intro,
    };
}

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
    const { sent } = await searchParams;
    const content = await kizuna.content.pages.contactPage.get();
    const footer = await optional(() => kizuna.content.globals.footer.get());
    const contacts = await kizuna.content.collections.employees.getMany({
        ids: [...listOf(content.contacts)],
    });
    const subjects = listOf(content.subjects);
    const hours = listOf(footer?.openingHours);

    return (
        <main>
            <Hero impact="low" eyebrow={content.eyebrow} heading={content.heading} subheading={content.intro} />
            <div className={styles.layout}>
                <div className={styles.formColumn}>
                    {sent === '1' ? (
                        <div role="status" className={styles.thanks}>
                            <p className={styles.thanksHeading}>
                                Thank you, <em>it is on its way.</em>
                            </p>
                            <p className={styles.thanksText}>{content.thanks}</p>
                        </div>
                    ) : (
                        <form action={sendContactMessage} className={styles.form}>
                            <div className={styles.pair}>
                                <label className={styles.field}>
                                    <span className={styles.label}>Name</span>
                                    <input name="name" autoComplete="name" required className={styles.input} />
                                </label>
                                <label className={styles.field}>
                                    <span className={styles.label}>Email</span>
                                    <input name="email" type="email" autoComplete="email" required className={styles.input} />
                                </label>
                            </div>
                            {subjects.length === 0 ? null : (
                                <label className={styles.field}>
                                    <span className={styles.label}>About</span>
                                    <select name="subject" className={styles.select}>
                                        {subjects.map((subject) => (
                                            <option key={subject} value={subject}>
                                                {subject}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <label className={styles.field}>
                                <span className={styles.label}>Message</span>
                                <textarea name="message" rows={5} required className={styles.input} />
                            </label>
                            <button type="submit" className={styles.submit}>
                                {content.buttonLabel}
                            </button>
                        </form>
                    )}
                </div>
                {footer === undefined ? null : (
                    <aside className={styles.details} aria-label="The shop">
                        <div className={styles.detail}>
                            <h2 className={styles.detailTitle}>The shop</h2>
                            <p className={styles.address}>{footer.address}</p>
                            {content.directions === undefined ? null : <p className={styles.muted}>{content.directions}</p>}
                        </div>
                        {hours.length === 0 ? null : (
                            <div className={styles.detail}>
                                <h2 className={styles.detailTitle}>Open</h2>
                                <dl className={styles.hours}>
                                    {hours.map((row) => (
                                        <div key={row.days} className={styles.hoursRow}>
                                            <dt>{row.days}</dt>
                                            <dd>{row.hours}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        )}
                        <div className={styles.detail}>
                            <h2 className={styles.detailTitle}>Call or write</h2>
                            <a href={`tel:${footer.phone.replace(/[^+\d]/g, '')}`}>{footer.phone}</a>
                            <a href={`mailto:${footer.contactEmail}`}>{footer.contactEmail}</a>
                        </div>
                    </aside>
                )}
            </div>
            {contacts.length === 0 ? null : (
                <section className={styles.people}>
                    <h2 className={styles.peopleHeading}>
                        Or write to one of us <em>directly</em>
                    </h2>
                    <ul className={styles.peopleList}>
                        {contacts.map((employee) => (
                            <li key={employee.id}>
                                <PersonTile employee={employee} compact />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
}
