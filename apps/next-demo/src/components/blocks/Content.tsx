import type { Output } from '@kizunajs/cms';
import type { ContentBlockSchema } from '../../cms/blocks';
import { Emphasis } from '../Emphasis';
import { Eyebrow } from '../Eyebrow';
import { Prose } from '../Prose';
import styles from './Content.module.css';

/**
 * Columns of text, numbered, under an optional heading.
 */
export function Content({ eyebrow, heading, columns }: Output<typeof ContentBlockSchema>) {
    return (
        <section className={styles.section}>
            {eyebrow === undefined && heading === undefined ? null : (
                <div className={styles.header}>
                    <Eyebrow text={eyebrow} />
                    {heading === undefined ? null : (
                        <h2 className={styles.heading}>
                            <Emphasis text={heading} />
                        </h2>
                    )}
                </div>
            )}
            <ol className={styles.columns} data-count={columns.length}>
                {columns.map((column, index) => (
                    <li key={index} className={styles.column}>
                        {columns.length === 1 ? null : <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>}
                        {column.heading === undefined ? null : <h3 className={styles.columnHeading}>{column.heading}</h3>}
                        <Prose value={column.body} size={columns.length === 1 ? 'large' : 'small'} />
                    </li>
                ))}
            </ol>
        </section>
    );
}
