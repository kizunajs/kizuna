import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import styles from './cms-setup.module.css';

interface Step {
    title: string;
    anchor: string;
    code: string;
}

const steps: Step[] = [
    {
        title: 'Create the tables',
        anchor: 'create-the-tables',
        code: 'kizuna cms migrate',
    },
    {
        title: 'Declare a page',
        anchor: 'declare-a-page',
        code: 'content.ts',
    },
    {
        title: 'Let Next find the pages',
        anchor: 'let-next-find-the-pages',
        code: 'withKizunaCms()',
    },
    {
        title: 'Add the CMS to your config',
        anchor: 'add-the-cms-to-your-config',
        code: 'cms({ db, pages })',
    },
    {
        title: 'Read it in the page',
        anchor: 'read-it-in-the-page',
        code: 'kizuna.content.pages.frontPage.get()',
    },
    {
        title: 'Add the preview',
        anchor: 'add-the-preview',
        code: '<KizunaPreview />',
    },
];

export function CmsSetup() {
    return (
        <Section
            aside={<DocsLink href="/docs/cms" />}
            title="Your Next.js site, in six steps"
            description="Runs inside your Next.js app, with content in your own Postgres database.">
            <div className={panel.panel}>
                <ol className={styles.steps}>
                    {steps.map((step, index) => (
                        <li key={step.anchor}>
                            <Link href={`/docs/cms#${step.anchor}`} className={styles.step}>
                                <span className={styles.number}>{index + 1}</span>
                                <span className={styles.title}>{step.title}</span>
                                <code className={styles.code}>{step.code}</code>
                                <ArrowRight className={styles.arrow} aria-hidden />
                            </Link>
                        </li>
                    ))}
                </ol>
            </div>
        </Section>
    );
}
