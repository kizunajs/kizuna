import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { source } from '@/lib/source';
import styles from './guide-notice.module.css';

/**
 * Points a page at the guide that puts it to work, reading the guide's own title and description.
 */
export function GuideNotice({ guide }: { guide: string }) {
    const page = source.getPage(['guides', guide]);
    if (!page) throw new Error(`GuideNotice names "${guide}", but there is no page at /docs/guides/${guide}.`);

    return (
        <Link href={page.url} className={styles.notice}>
            <span className={styles.label}>Guide</span>
            <span className={styles.title}>
                {page.data.title}
                <ArrowRight className={styles.arrow} aria-hidden />
            </span>
            {page.data.description ? <span className={styles.description}>{page.data.description}</span> : null}
        </Link>
    );
}
