import clsx from 'clsx';
import { Languages, Link2 } from 'lucide-react';
import { CodeWindow } from '@/components/code/code-window';
import { Section } from '../section';
import panel from '../panel.module.css';
import editor from './cms-editor.module.css';
import { Footer, FormSection, Row, Shell, TextInput } from './cms-editor-mock';
import styles from './cms-localization.module.css';
import views from './cms-views.module.css';

const locales = [
    {
        code: 'EN',
        progress: 'Published',
    },
    {
        code: 'NB',
        progress: 'Draft, 2 of 3',
        active: true,
    },
    {
        code: 'DE',
        progress: 'Not started',
    },
];

const configCode = `content: cms({
    db,
    pages,
    locales: ['en', 'nb', 'de'],
}),`;

const readCode = `const content = await kizuna.content.pages.frontPage.get({
    locale: 'nb',
});`;

const points = [
    {
        title: 'Field by field',
        text: 'Each field shows the source beside it, so nothing is translated blind.',
    },
    {
        title: 'The model drafts the rest',
        text: 'Ask Claude to translate what is missing. It saves a draft for a person to publish.',
    },
    {
        title: 'Each language on its own',
        text: 'Publish Norwegian today and German next week. Drafts and reviews are per language.',
    },
];

function Source({ children }: { children: string }) {
    return <p className={styles.source}>EN · {children}</p>;
}

export function CmsLocalization() {
    return (
        <Section
            title={
                <>
                    <span className={views.soon}>Coming soon</span>
                    Your site, in every language
                </>
            }
            description="Every page keeps a version per language. Editors translate field by field, or ask the model to draft the rest.">
            <div className={panel.panel}>
                <div className={styles.split}>
                    <Shell title="Front Page" status="Unpublished changes">
                        <div className={styles.locales}>
                            {locales.map((locale) => (
                                <span key={locale.code} className={clsx(editor.tab, locale.active && editor.tabActive)}>
                                    <span className={styles.code}>{locale.code}</span>
                                    <span className={styles.progress}>{locale.progress}</span>
                                </span>
                            ))}
                        </div>
                        <FormSection>
                            <Row label="Heading">
                                <Source>Invoices that send themselves</Source>
                                <TextInput value="Fakturaer som sender seg selv" max={60} />
                            </Row>
                            <Row label="Introduction">
                                <Source>Create, send and chase invoices from one place.</Source>
                                <TextInput value="Lag, send og følg opp fakturaer på ett sted." max={400} />
                            </Row>
                            <Row label="Button">
                                <Source>Start for free</Source>
                                <div className={clsx(editor.input, styles.missing)}>
                                    <span className={editor.value}>Not translated yet</span>
                                </div>
                            </Row>
                            <Row label="Hero image">
                                <div className={styles.shared}>
                                    <img src="/cms/team-at-laptops.jpg" alt="" />
                                    <span className={editor.help}>
                                        <Link2 aria-hidden />
                                        The same in every language
                                    </span>
                                </div>
                            </Row>
                        </FormSection>
                        <Footer>
                            <span className={clsx(editor.button, editor.secondary)}>
                                <Languages aria-hidden />
                                Translate the rest
                            </span>
                            <span className={clsx(editor.button, editor.primary)}>Publish Norwegian</span>
                        </Footer>
                    </Shell>

                    <div className={styles.codeStack}>
                        <CodeWindow lang="ts" code={configCode} title="kizuna.config.ts" />
                        <CodeWindow lang="tsx" code={readCode} title="src/app/[locale]/page.tsx" />
                    </div>
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
