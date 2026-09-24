import clsx from 'clsx';
import styles from './badge.module.css';

export type Stage = 'alpha' | 'beta';

const labels: Record<Stage, string> = {
    alpha: 'Alpha',
    beta: 'Beta',
};

interface BadgeProps {
    stage: Stage;
    size?: 'small' | 'medium';
    className?: string;
}

export function Badge({ stage, size = 'small', className }: BadgeProps) {
    return <span className={clsx(styles.badge, styles[size], className)}>{labels[stage]}</span>;
}
