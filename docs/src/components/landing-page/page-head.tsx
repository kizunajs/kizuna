import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './page-head.module.css';

interface PageHeadProps {
    label: string;
    title: ReactNode;
    description?: ReactNode;
    align?: 'center' | 'start';
    className?: string;
    children?: ReactNode;
}

export function PageHead({ label, title, description, align = 'center', className, children }: PageHeadProps) {
    return (
        <header className={clsx(styles.head, align === 'center' && styles.center, className)}>
            <p className={styles.label}>{label}</p>
            <h1 className={styles.title}>{title}</h1>
            {description ? <p className={styles.description}>{description}</p> : null}
            {children ? <div className={styles.actions}>{children}</div> : null}
        </header>
    );
}
