import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
    ArrowRight,
    Bold,
    Code,
    Heading2,
    Heading3,
    Italic,
    Link as LinkIcon,
    List,
    ListOrdered,
    Pilcrow,
    Package,
    Quote,
    TriangleAlert,
    Underline,
} from 'lucide-react';
import { CodeWindow } from '@/components/code/code-window';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import editor from './cms-editor.module.css';
import { FormSection, Row, Shell } from './cms-editor-mock';
import styles from './cms-rich-text.module.css';

const fieldCode = `{
    name: 'body',
    schema: richText({
        blocks: [CalloutBlock, ProductBlock],
    }),
},`;

const renderCode = `<RichText
    value={article.body}
    components={{
        types: {
            callout: Callout,
            product: ProductCard,
        },
    }}
/>`;

function Tool({ active = false, children }: { active?: boolean; children: ReactNode }) {
    return <span className={clsx(editor.tool, active && editor.toolActive)}>{children}</span>;
}

function RichTextEditor() {
    return (
        <div className={editor.rich}>
            <div className={editor.richTools}>
                <Tool>
                    <Pilcrow aria-hidden />
                </Tool>
                <Tool active>
                    <Heading2 aria-hidden />
                </Tool>
                <Tool>
                    <Heading3 aria-hidden />
                </Tool>
                <Tool>
                    <Quote aria-hidden />
                </Tool>
                <span className={editor.richDivider} />
                <Tool active>
                    <Bold aria-hidden />
                </Tool>
                <Tool>
                    <Italic aria-hidden />
                </Tool>
                <Tool>
                    <Underline aria-hidden />
                </Tool>
                <Tool>
                    <Code aria-hidden />
                </Tool>
                <span className={editor.richDivider} />
                <Tool>
                    <List aria-hidden />
                </Tool>
                <Tool>
                    <ListOrdered aria-hidden />
                </Tool>
                <span className={editor.richDivider} />
                <Tool>
                    <LinkIcon aria-hidden />
                </Tool>
                <span className={editor.richImageButton}>Image</span>
                <span className={editor.richBlockButton}>Block</span>
            </div>
            <div className={editor.richBody}>
                <h2>What changed in 2.0</h2>
                <p>
                    Handlers now live <strong className={editor.richSelected}>on the route</strong>, and every client reads from one config.
                    See the <span className={editor.richLink}>migration guide</span> for each step.
                </p>
                <ul>
                    <li>
                        <code>kizuna diff</code> flags breaking changes
                    </li>
                    <li>Jobs run on any platform scheduler</li>
                    <li>Routes publish as MCP tools</li>
                </ul>
                <div className={editor.richBlock}>
                    <span className={editor.richBlockType}>
                        <TriangleAlert aria-hidden />
                        Callout
                    </span>
                    <p className={editor.richCallout}>
                        <strong>Heads up.</strong> Node 24 is now the minimum.
                    </p>
                </div>
                <div className={editor.richBlock}>
                    <span className={editor.richBlockType}>
                        <Package aria-hidden />
                        Product
                    </span>
                    <div className={editor.richProduct}>
                        <img src="/cms/office-corridor.jpg" alt="" />
                        <span className={editor.richProductBody}>
                            <strong>Kizuna CMS</strong>
                            <span>From your API</span>
                        </span>
                        <span className={clsx(editor.button, editor.secondary, editor.small)}>Change</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface Point {
    title: string;
    text: string;
    href: string;
}

const points: Point[] = [
    {
        title: 'Never HTML',
        text: 'It stores Portable Text, structured JSON your page renders its own way.',
        href: '/docs/cms/content#rich-text',
    },
    {
        title: 'Links that are safe',
        text: 'https, mailto, tel and paths on the site. A javascript: link fails the schema.',
        href: '/docs/cms/content#rich-text',
    },
    {
        title: 'Blocks of your own',
        text: 'A callout or a product card in the text, rendered by your component.',
        href: '/docs/cms/next#rich-text',
    },
];

export function CmsRichText() {
    return (
        <Section
            aside={<DocsLink href="/docs/cms/content#rich-text" />}
            title="Your articles, richly formatted"
            description="Headings, lists, links, images and blocks of your own, in the form or written by the model.">
            <div className={panel.panel}>
                <div className={styles.split}>
                    <Shell title="What changed in 2.0" status="Published">
                        <FormSection>
                            <Row label="Body">
                                <RichTextEditor />
                            </Row>
                        </FormSection>
                    </Shell>
                    <div className={styles.code}>
                        <CodeWindow lang="ts" code={fieldCode} title="src/cms/content.ts" />
                        <CodeWindow lang="tsx" code={renderCode} title="src/app/blog/[slug]/page.tsx" />
                    </div>
                </div>

                <div className={styles.points}>
                    {points.map((point) => (
                        <div key={point.title} className={panel.body}>
                            <Link href={point.href} className={panel.title}>
                                {point.title}
                                <ArrowRight className={panel.arrow} aria-hidden />
                            </Link>
                            <p className={panel.text}>{point.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}
