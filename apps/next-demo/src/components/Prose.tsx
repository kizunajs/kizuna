import { RichText, type RichTextContent } from '@kizunajs/cms/next';
import styles from './Prose.module.css';

/**
 * Rich text from the CMS, set for reading.
 */
export function Prose({ value }: { value: RichTextContent }) {
    return (
        <div className={styles.prose}>
            <RichText value={value} />
        </div>
    );
}
