import kizuna from '@kizunajs-demo/sites-content/config';
import { EventList, OfficeList, PageIntro } from '@kizunajs-demo/sites-ui';
import { words } from '../lib/words';
import styles from './page.module.css';

export default async function FrontPage() {
    const content = kizuna.content.of(['uk', 'norway']);
    const site = await kizuna.content.site.get();
    const said = words[content.site];
    const page = await content.pages.frontPage.get();
    const { items: offices } = await kizuna.content.collections.offices.list({
        orderBy: 'order',
        direction: 'asc',
    });
    const upcoming =
        content.site === 'uk'
            ? (
                  await content.collections.events.list({
                      orderBy: 'date',
                      direction: 'asc',
                      limit: 2,
                  })
              ).items
            : [];
    return (
        <main>
            <PageIntro eyebrow={site.label} heading={page.heading} text={page.intro} />
            <div className={styles.sections}>
                {upcoming.length === 0 ? null : (
                    <section className={styles.section}>
                        <h2 className={styles.heading}>{said.upcoming}</h2>
                        <EventList events={upcoming} />
                        <a className={styles.more} href="/events">
                            {said.allEvents}
                        </a>
                    </section>
                )}
                <section className={styles.section}>
                    <h2 className={styles.heading}>{said.ourShops}</h2>
                    <OfficeList offices={offices} />
                </section>
            </div>
        </main>
    );
}
