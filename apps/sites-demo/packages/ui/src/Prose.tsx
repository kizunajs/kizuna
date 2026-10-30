import styles from './Prose.module.css';

/**
 * Plain text as paragraphs, split at each blank line.
 */
export function Prose({ text }: { text: string }) {
    return (
        <div className={styles.prose}>
            {text.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
            ))}
        </div>
    );
}
