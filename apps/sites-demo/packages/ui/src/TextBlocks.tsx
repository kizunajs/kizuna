import { CmsImage, type Image } from './Image';
import styles from './TextBlocks.module.css';

/**
 * A tip, a warning or a note set apart from the text: its kind over its words,
 * on a rule that grows darker from note to warning.
 */
export function Callout({ tone, label, text }: { tone: 'tip' | 'warning' | 'note'; label: string; text: string }) {
    return (
        <aside className={styles.callout} data-tone={tone}>
            <p className={styles.eyebrow}>{label}</p>
            <p className={styles.calloutText}>{text}</p>
        </aside>
    );
}

/**
 * A sentence someone said, large, with their name and role under it.
 */
export function PullQuote({ quote, person }: { quote: string; person?: { name: string; role: string } | undefined }) {
    return (
        <figure className={styles.quote}>
            <blockquote className={styles.quoteText}>
                <p>&ldquo;{quote}&rdquo;</p>
            </blockquote>
            {person === undefined ? null : (
                <figcaption className={styles.quoteBy}>
                    <span className={styles.quoteName}>{person.name}</span>
                    <span>{person.role}</span>
                </figcaption>
            )}
        </figure>
    );
}

/**
 * A plant as it sells in the shops.
 */
export interface Plant {
    name: string;
    price: string;
    summary: string;
    photo: Image;
}

/**
 * One plant: its photo beside its name, price and summary, with a link to
 * the shops that sell it.
 */
export function PlantCard({ plant, eyebrow, shops }: { plant: Plant; eyebrow: string; shops: { href: string; label: string } }) {
    return (
        <article className={styles.plant}>
            <CmsImage className={styles.plantPhoto} image={plant.photo} width={176} height={176} />
            <div className={styles.plantText}>
                <p className={styles.eyebrow}>{eyebrow}</p>
                <h3 className={styles.plantName}>{plant.name}</h3>
                <p className={styles.plantPrice}>{plant.price}</p>
                <p className={styles.muted}>{plant.summary}</p>
                <a className={styles.more} href={shops.href}>
                    {shops.label}
                </a>
            </div>
        </article>
    );
}

/**
 * A photo across the text column, with its caption under it.
 */
export function Figure({ image, caption }: { image: Image; caption?: string | undefined }) {
    return (
        <figure className={styles.figure}>
            <CmsImage className={styles.figureImage} image={image} width={680} height={453} />
            {caption === undefined || caption === '' ? null : <figcaption className={styles.caption}>{caption}</figcaption>}
        </figure>
    );
}

/**
 * Two photos side by side, with one caption under both.
 */
export function ImagePair({ left, right, caption }: { left: Image; right: Image; caption?: string | undefined }) {
    return (
        <figure className={styles.figure}>
            <div className={styles.pair}>
                <CmsImage className={styles.figureImage} image={left} width={332} height={415} />
                <CmsImage className={styles.figureImage} image={right} width={332} height={415} />
            </div>
            {caption === undefined || caption === '' ? null : <figcaption className={styles.caption}>{caption}</figcaption>}
        </figure>
    );
}

/**
 * Questions and answers, each answer folded under its question.
 */
export function Faq({ questions }: { questions: ReadonlyArray<{ question: string; answer: string }> }) {
    return (
        <div className={styles.faq}>
            {questions.map((entry) => (
                <details key={entry.question} className={styles.faqItem}>
                    <summary className={styles.faqQuestion}>{entry.question}</summary>
                    <p className={styles.muted}>{entry.answer}</p>
                </details>
            ))}
        </div>
    );
}

/**
 * A link set as a button.
 */
export function ButtonLink({ href, label }: { href: string; label: string }) {
    return (
        <p className={styles.buttonRow}>
            <a className={styles.button} href={href}>
                {label}
            </a>
        </p>
    );
}

/**
 * An article as another one links it.
 */
export interface LinkedArticle {
    id: string;
    title: string;
    summary: string;
    image?: Image | undefined;
}

/**
 * Another article from the journal: its photo beside its title and summary,
 * the whole of it a link.
 */
export function RelatedArticle({ article, eyebrow }: { article: LinkedArticle; eyebrow: string }) {
    return (
        <a className={styles.related} href={`/journal/${article.id}`}>
            {article.image === undefined ? null : (
                <CmsImage className={styles.relatedImage} image={article.image} width={210} height={140} />
            )}
            <span className={styles.relatedText}>
                <span className={styles.eyebrow}>{eyebrow}</span>
                <span className={styles.relatedTitle}>{article.title}</span>
                <span className={styles.muted}>{article.summary}</span>
            </span>
        </a>
    );
}
