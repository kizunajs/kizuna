import { CodeWindow } from '@/components/code/code-window';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import styles from './cms-search.module.css';
import views from './cms-views.module.css';

const pageCode = `export default definePage({
    name: 'articlePage',
    collection: Articles,
    metadata: {
        title: ({ content }) => content.title,
        description: ({ content }) => content.summary,
        image: ({ content }) => content.cover,
        type: 'Article',
    },
});`;

const points = [
    {
        title: 'The page gives its words',
        text: 'The separator and the site’s name are one line in the config, so changing them changes nothing stored.',
    },
    {
        title: 'The rest is written for you',
        text: 'Structured data, the sitemap, the language alternates and a redirect for every rename, from the typed fields.',
    },
];

function SearchResult() {
    return (
        <div className={styles.result} aria-label="A search result">
            <div className={styles.site}>
                <span className={styles.favicon} aria-hidden />
                <span>
                    <span className={styles.siteName}>Acme</span>
                    <span className={styles.url}>https://example.com › blog › new-office</span>
                </span>
            </div>
            <p className={styles.title}>New office, same people | Acme</p>
            <p className={styles.description}>
                We have moved to 12 Harbour Street. The team, the phone number and the coffee are the same, and the view is better.
            </p>
            <div className={styles.meters}>
                <span>
                    Title <strong>29 of 60</strong>
                </span>
                <span>
                    Description <strong>118 of 160</strong>
                </span>
            </div>
        </div>
    );
}

export function CmsSearch() {
    return (
        <Section
            title={
                <>
                    <span className={views.soon}>Coming soon</span>
                    Found by search
                </>
            }
            description="A page says what its search result shows, typed from its fields. The site adds its name once."
            aside={<DocsLink href="/docs/cms/seo" />}>
            <div className={panel.panel}>
                <div className={styles.split}>
                    <CodeWindow lang="ts" code={pageCode} title="src/app/blog/[slug]/content.ts" />
                    <SearchResult />
                </div>
                <div className={styles.points}>
                    {points.map((point) => (
                        <div key={point.title} className={panel.body}>
                            <h3 className={panel.title}>{point.title}</h3>
                            <p className={panel.text}>{point.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}
