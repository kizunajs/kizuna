import type { Metadata } from 'next';
import kizuna from '@kizuna-config';
import { sendContactMessage } from './actions';
import { Hero } from '../../components/blocks/Hero';
import { Section } from '../../components/Section';
import { EmployeeCard } from '../../components/EmployeeCard';
import { optional } from '../../lib/optional';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Contact',
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
    const { sent } = await searchParams;
    const content = await kizuna.content.pages.contactPage.get();
    const footer = await optional(() => kizuna.content.globals.footer.get());
    const contacts = await kizuna.content.collections.employees.getMany({
        ids: content.contacts,
    });

    return (
        <main>
            <Hero impact="low" heading={content.heading} subheading={content.intro} />
            <Section tight>
                <div className={styles.layout}>
                    <div>
                        {sent === '1' ? (
                            <p role="status" className={styles.thanks}>
                                {content.thanks}
                            </p>
                        ) : (
                            <form action={sendContactMessage} className={styles.form}>
                                <label className={styles.field}>
                                    <span>Name</span>
                                    <input name="name" placeholder="Name" autoComplete="name" required className={styles.input} />
                                </label>
                                <label className={styles.field}>
                                    <span>Email</span>
                                    <input
                                        name="email"
                                        type="email"
                                        placeholder="Email"
                                        autoComplete="email"
                                        required
                                        className={styles.input}
                                    />
                                </label>
                                <label className={styles.field}>
                                    <span>Message</span>
                                    <textarea name="message" placeholder="Message" rows={6} required className={styles.input} />
                                </label>
                                <button type="submit" className={styles.submit}>
                                    {content.buttonLabel}
                                </button>
                            </form>
                        )}
                    </div>
                    {footer === undefined ? null : (
                        <aside className={styles.aside}>
                            <dl className={styles.details}>
                                <div>
                                    <dt>Shop</dt>
                                    <dd>{footer.address}</dd>
                                </div>
                                <div>
                                    <dt>Open</dt>
                                    <dd>{footer.openingHours}</dd>
                                </div>
                                <div>
                                    <dt>Phone</dt>
                                    <dd>{footer.phone}</dd>
                                </div>
                                <div>
                                    <dt>Email</dt>
                                    <dd>
                                        <a href={`mailto:${footer.contactEmail}`}>{footer.contactEmail}</a>
                                    </dd>
                                </div>
                            </dl>
                        </aside>
                    )}
                </div>
            </Section>
            {contacts.length > 0 ? (
                <Section heading="Talk to us directly">
                    <ul className={styles.contacts}>
                        {contacts.map((employee) => (
                            <li key={employee.id}>
                                <EmployeeCard employee={employee} />
                            </li>
                        ))}
                    </ul>
                </Section>
            ) : null}
        </main>
    );
}
