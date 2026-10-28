import type { Metadata } from 'next';
import kizuna from '@kizuna-config';
import { departments } from '../../cms/content';
import { sizedImage } from '../../lib/image';
import { Hero } from '../../components/blocks/Hero';
import { Eyebrow } from '../../components/Eyebrow';
import { Emphasis } from '../../components/Emphasis';
import { ButtonLink } from '../../components/ButtonLink';
import { PersonTile } from '../../components/PersonTile';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
    const content = await kizuna.content.pages.teamPage.get();
    return {
        title: content.seo?.title ?? 'Team',
        description: content.seo?.description ?? content.intro,
    };
}

export default async function TeamPage() {
    const content = await kizuna.content.pages.teamPage.get();
    const { items } = await kizuna.content.collections.employees.list({
        orderBy: 'order',
        direction: 'asc',
        limit: 100,
    });
    const shown = Object.entries(departments)
        .map(([department, label]) => ({
            label,
            people: items.filter((employee) => employee.department === department),
        }))
        .filter((group) => group.people.length > 0);

    return (
        <main>
            {content.photoLayout === 'beside' ? (
                <Hero
                    impact="medium"
                    eyebrow={content.eyebrow}
                    heading={content.heading}
                    subheading={content.intro}
                    image={content.photo}
                    caption={content.caption}
                />
            ) : (
                <>
                    <Hero impact="low" eyebrow={content.eyebrow} heading={content.heading} subheading={content.intro} />
                    {content.photo === undefined ? null : (
                        <figure className={styles.photo}>
                            <img
                                className={styles.photoImage}
                                src={sizedImage(content.photo.url, 1600, 667)}
                                alt={content.photo.alt}
                                width={1600}
                                height={667}
                            />
                            {content.caption === undefined ? null : <figcaption className={styles.caption}>{content.caption}</figcaption>}
                        </figure>
                    )}
                </>
            )}
            {shown.map((group) => (
                <section key={group.label} className={styles.department}>
                    <div className={styles.departmentHeader}>
                        <Eyebrow text={group.label} />
                        <span className={styles.count}>{String(group.people.length).padStart(2, '0')}</span>
                    </div>
                    <ul className={styles.grid}>
                        {group.people.map((employee) => (
                            <li key={employee.id}>
                                <PersonTile employee={employee} />
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
            {content.hiringHeading === undefined ? null : (
                <section className={styles.hiring}>
                    <div className={styles.hiringInner}>
                        <h2 className={styles.hiringHeading}>
                            <Emphasis text={content.hiringHeading} />
                        </h2>
                        <div className={styles.hiringAction}>
                            {content.hiringText === undefined ? null : <p>{content.hiringText}</p>}
                            {content.hiringEmail === undefined ? null : (
                                <ButtonLink href={`mailto:${content.hiringEmail}`} label={content.hiringEmail} />
                            )}
                        </div>
                    </div>
                </section>
            )}
        </main>
    );
}
