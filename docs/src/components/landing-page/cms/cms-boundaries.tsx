import type { ComponentType } from 'react';
import { Ban, Check, Hand } from 'lucide-react';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import styles from './cms-boundaries.module.css';

interface Column {
    title: string;
    icon: ComponentType<{ className?: string }>;
    items: string[];
}

const columns: Column[] = [
    {
        title: 'Editors can',
        icon: Check,
        items: [
            'Change text, images, rich text and lists, within each field’s limits',
            'Ask the model, or click the text on the page',
            'Pick products from your own API or Stripe',
            'Ask a colleague to review before it goes live',
            'Publish, and roll back to any earlier version',
        ],
    },
    {
        title: 'Editors can’t',
        icon: Ban,
        items: [
            'Change the layout or the design, since they only get the fields you declare',
            'Write HTML or scripts, since rich text never holds HTML and SVG uploads are refused',
            'Touch a field their role doesn’t allow',
            'Edit your products or orders, which stay in your own API',
            'Overwrite a colleague’s newer change',
        ],
    },
    {
        title: 'The model asks first',
        icon: Hand,
        items: [
            'It writes drafts freely, since nothing goes live until a person publishes',
            'Publishing, rolling back and deleting an item ask the person first',
            'So does any change to a global, which every page shows',
            'Every version still names a person as its author',
            'It sees the fields and limits of the person it works for',
        ],
    },
];

export function CmsBoundaries() {
    return (
        <Section
            aside={<DocsLink href="/docs/cms/editing#what-holds" />}
            title="Your rules, everywhere"
            description="Editors change the fields you declare, and the model asks before anything goes live.">
            <div className={styles.columns}>
                {columns.map((column) => (
                    <article key={column.title} className={panel.panel}>
                        <div className={styles.body}>
                            <h3 className={styles.title}>
                                <span className={styles.icon}>
                                    <column.icon />
                                </span>
                                {column.title}
                            </h3>
                            <ul className={styles.items}>
                                {column.items.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </article>
                ))}
            </div>
        </Section>
    );
}
