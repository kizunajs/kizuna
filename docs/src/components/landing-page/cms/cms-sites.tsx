import { CodeWindow } from '@/components/code/code-window';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import styles from './cms-sites.module.css';
import views from './cms-views.module.css';

const configCode = `content: cms({
    db,
    collections: [Employees, Offices],
    sites: {
        web: {
            pages: webPages,
            app: '../../apps/web/src/app',
        },
        uk: {
            pages: ukPages,
            app: '../../apps/uk/src/app',
            collections: [Events],
        },
    },
}),`;

const readCode = `// every site
kizuna.content.collections.offices

// the UK alone
kizuna.content.sites.uk.collections.events`;

const points = [
    {
        title: 'Written once',
        text: 'The people and the offices are listed on cms(), and every site reads them.',
    },
    {
        title: 'Each site’s own',
        text: 'A site lists what only it has, and adds its own fields to what every site shows.',
    },
];

export function CmsSites() {
    return (
        <Section
            title={
                <>
                    <span className={views.soon}>Coming soon</span>
                    One site, or a business full of them
                </>
            }
            description="Content every site reads, and each site’s own beside it, in one CMS."
            aside={<DocsLink href="/docs/cms/sites" />}>
            <div className={panel.panel}>
                <div className={styles.split}>
                    <CodeWindow lang="ts" code={configCode} title="packages/content/kizuna.cms.config.ts" />
                    <CodeWindow lang="ts" code={readCode} title="apps/uk/src/app/events/page.tsx" />
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
