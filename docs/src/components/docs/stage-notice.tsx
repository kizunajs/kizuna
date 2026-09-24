import type { ReactNode } from 'react';
import { Badge, type Stage } from '@/components/shared/badge';
import styles from './stage-notice.module.css';

export function StageNotice({ stage, children }: { stage: Stage; children: ReactNode }) {
    return (
        <aside className={styles.notice} data-stage-notice="">
            <Badge stage={stage} size="medium" />
            <div className={styles.body}>{children}</div>
        </aside>
    );
}
