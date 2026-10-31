import styles from './EmailPreview.module.css';

/**
 * An email in the whole window, over the site's header and footer, since an
 * inbox shows it with neither.
 */
export function EmailPreview({ html, title }: { html: string; title: string }) {
    return <iframe className={styles.frame} srcDoc={html} title={title} />;
}
