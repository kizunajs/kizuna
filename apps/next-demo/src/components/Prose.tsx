import { RichText, type RichTextContent } from '@kizunajs/cms/next';
import styles from './Prose.module.css';

/**
 * Rich text from the CMS, set for reading.
 */
export function Prose({ value, size = 'large' }: { value: RichTextContent; size?: 'large' | 'small' }) {
    return (
        <div className={size === 'large' ? styles.large : styles.small}>
            <RichText value={value} />
        </div>
    );
}
