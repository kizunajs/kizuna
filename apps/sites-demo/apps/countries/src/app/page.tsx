import kizuna from '@kizunajs-demo/sites-content/config';
import { EventList, OfficeList, PageIntro } from '@kizunajs-demo/sites-ui';
import { wordsOf } from '../lib/words';
import { localeOf } from '../lib/locale';
import styles from './page.module.css';

export default async function FrontPage() {
    const content = kizuna.content.of(['uk', 'norway']);
    const site = await kizuna.content.site.get();
    const locale = await localeOf();
    const said = wordsOf(content.site, locale);
    const page = await content.pages.frontPage.get({
        locale,
    });
    const { items: offices } = await kizuna.content.collections.offices.list({
        orderBy: 'order',
        direction: 'asc',
        locale,
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
