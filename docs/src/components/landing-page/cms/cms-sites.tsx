import { CodeWindow } from '@/components/code/code-window';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import styles from './cms-sites.module.css';
import views from './cms-views.module.css';

const configCode = `content: cms({
    db,
    collections: [Employees, Offices],
    sites: declareSites(Site, {
        group: {
            label: 'Hagen Group',
            url: 'https://hagen.example.com',
            icon: '/icons/group.svg',
            pages: groupPages,
        },
        uk: {
            label: 'Hagen UK',
            url: 'https://hagen.example.co.uk',
            icon: '/icons/uk.svg',
            pages: countryPages,
            collections: [Events],
        },
    }),
    site: () => process.env.KIZUNA_SITE,
}),`;

const readCode = `// shared offices, with this site's own phone numbers
kizuna.content.collections.offices

// the UK's own
kizuna.content.of(['uk']).collections.events`;

const points = [
    {
        title: 'Written once',
        text: 'The people and the offices are listed on cms(), and every site reads them.',
    },
    {
        title: 'Each site’s own',
        text: 'A site lists what only it has, and sets its own values on shared fields.',
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
                    <CodeWindow lang="ts" code={readCode} title="apps/countries/src/app/events/page.tsx" />
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
