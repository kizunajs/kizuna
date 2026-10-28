import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizuna-config';
import { LinkButton } from '../components/LinkButton';
import panel from '../components/Panel.module.css';
import styles from './not-found.module.css';

export default function NotFound() {
    return (
        <main className={`${panel.page} ${styles.page}`}>
            <h1 className={panel.title}>Not found</h1>
            <p className={panel.lead}>There is nothing at this address. It may have moved, or it has not been published yet.</p>
            <div className={styles.actions}>
                <LinkButton href="/" label="Back to the shop" variant="primary" />
            </div>
            <KizunaPreview content={kizuna.content} />
        </main>
    );
}
