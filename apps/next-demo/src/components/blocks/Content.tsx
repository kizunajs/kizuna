import type { Output } from '@kizunajs/cms';
import type { ContentBlockSchema } from '../../cms/blocks';
import { Prose } from '../Prose';
import { Section } from '../Section';
import styles from './Content.module.css';

/**
 * Text in columns: one runs full width, two split the row, three make thirds.
 */
export function Content({ columns }: Output<typeof ContentBlockSchema>) {
    return (
        <Section>
            <div className={styles.columns} data-count={columns.length}>
                {columns.map((column, index) => (
                    <div key={index} className={styles.column}>
                        {column.heading === undefined ? null : <h2 className={styles.heading}>{column.heading}</h2>}
                        <Prose value={column.body} />
                    </div>
                ))}
            </div>
        </Section>
    );
}
