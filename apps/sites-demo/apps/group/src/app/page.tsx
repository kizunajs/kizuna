import kizuna from '@kizunajs-demo/sites-content/config';
import { OfficeList, PageIntro } from '@kizunajs-demo/sites-ui';
import styles from './page.module.css';

export default async function FrontPage() {
    const page = await kizuna.content.of(['group']).pages.frontPage.get();
    const { items: offices } = await kizuna.content.collections.offices.list({
        orderBy: 'order',
        direction: 'asc',
    });
    return (
        <main>
            <PageIntro eyebrow="Hagen Group" heading={page.heading} text={page.intro} />
            <section className={styles.shops}>
                <h2 className={styles.heading}>Our shops</h2>
                <OfficeList offices={offices} />
            </section>
        </main>
    );
}
