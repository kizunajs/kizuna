import styles from './ArticleList.module.css';

export interface Article {
    id: string;
    title: string;
    summary: string;
    date: string;
}

/**
 * Journal articles, newest first, each with its date and summary, and its
 * title a link to it.
 */
export function ArticleList({ articles, locale }: { articles: Article[]; locale: string }) {
    const dateFormat = new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
    return (
        <ol className={styles.list}>
            {articles.map((article) => (
                <li key={article.id} id={article.id} className={styles.article}>
                    <p className={styles.date}>{dateFormat.format(new Date(article.date))}</p>
                    <div className={styles.body}>
                        <h2 className={styles.title}>
                            <a href={`/journal/${article.id}`}>{article.title}</a>
                        </h2>
                        <p className={styles.summary}>{article.summary}</p>
                    </div>
                </li>
            ))}
        </ol>
    );
}
