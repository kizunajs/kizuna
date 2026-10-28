import styles from './Eyebrow.module.css';

/**
 * The small label above a heading, after a square.
 */
export function Eyebrow({ text, as: Element = 'p' }: { text?: string; as?: 'p' | 'span' }) {
    if (text === undefined || text === '') return null;
    return <Element className={styles.eyebrow}>{text}</Element>;
}
