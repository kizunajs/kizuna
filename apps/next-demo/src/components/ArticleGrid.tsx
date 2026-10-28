import type { Output } from '@kizunajs/cms';
import type { Articles } from '../cms/content';
import { ArticleCard } from './ArticleCard';
import styles from './ArticleGrid.module.css';

export function ArticleGrid({ articles }: { articles: Array<Output<typeof Articles>> }) {
    return (
        <ul className={styles.grid}>
            {articles.map((article) => (
                <li key={article.id}>
                    <ArticleCard article={article} />
                </li>
            ))}
        </ul>
    );
}
