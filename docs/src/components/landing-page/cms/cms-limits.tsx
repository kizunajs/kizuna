import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import editor from './cms-editor.module.css';
import { Editor, Help, Select, TextInput } from './cms-editor-mock';
import styles from './cms-limits.module.css';

interface Limit {
    area: 'image' | 'heading' | 'look' | 'admin' | 'articles' | 'link';
    want: string;
    schema: string;
    input: ReactNode;
}

const limits: Limit[] = [
    {
        area: 'image',
        want: 'An image with a crop and alt text',
        schema: 'ImageSchema',
        input: (
            <div className={styles.image}>
                <div className={styles.photo}>
                    <img src="/cms/team-at-laptops.jpg" alt="" />
                    <span className={styles.focal} />
                </div>
                <TextInput value="The team at work" />
            </div>
        ),
    },
    {
        area: 'heading',
        want: 'A short heading',
        schema: 'z.string().max(60)',
        input: (
            <>
                <TextInput value="Invoices that send themselves" max={60} />
                <Help>Under 8 words. No full stop.</Help>
            </>
        ),
    },
    {
        area: 'look',
        want: 'One of a few looks',
        schema: "z.enum(['light', 'dark'])",
        input: <Select value="Light" />,
    },
    {
        area: 'admin',
        want: 'Only admins change it',
        schema: "roles: 'admin'",
        input: (
            <div className={styles.locked}>
                <TextInput value="Prices include VAT." disabled />
                <Lock className={editor.icon} aria-hidden />
            </div>
        ),
    },
    {
        area: 'articles',
        want: 'Two to six articles',
        schema: 'z.array(ArticleId).min(2).max(6)',
        input: (
            <div className={styles.stack}>
                <Select value="New office, same people" image="/cms/office-corridor.jpg" />
                <Select value="A day out with the support team" image="/cms/team-at-laptops.jpg" />
            </div>
        ),
    },
    {
        area: 'link',
        want: 'A link that is https',
        schema: 'z.url({ protocol: /^https$/ })',
        input: (
            <>
                <TextInput value="https://example.com/pricing" />
                <Help>https only</Help>
            </>
        ),
    },
];

export function CmsLimits() {
    return (
        <Section
            aside={<DocsLink href="/docs/cms/content#limits-that-keep-the-design" />}
            title="Your design, kept intact"
            description="Every field is plain Zod, so its limits hold for editors, models and the API alike.">
            <div className={styles.bento}>
                {limits.map((limit) => (
                    <div key={limit.area} className={clsx(styles.tile, styles[limit.area])}>
                        <div className={styles.head}>
                            <p className={styles.want}>{limit.want}</p>
                            <code className={styles.schema}>{limit.schema}</code>
                        </div>
                        <Editor className={styles.well}>{limit.input}</Editor>
                    </div>
                ))}
            </div>
        </Section>
    );
}
