import styles from './PageIntro.module.css';

/**
 * A page's opening: a word or two above, the heading, and a sentence under it.
 */
export function PageIntro({ eyebrow, heading, text }: { eyebrow?: string | undefined; heading: string; text?: string | undefined }) {
    return (
        <div className={styles.intro}>
            {eyebrow === undefined ? null : <p className={styles.eyebrow}>{eyebrow}</p>}
            <h1 className={styles.heading}>{heading}</h1>
            {text === undefined ? null : <p className={styles.text}>{text}</p>}
        </div>
    );
}
