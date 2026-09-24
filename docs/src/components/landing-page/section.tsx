import clsx from 'clsx';
import type { ReactNode } from 'react';
import styles from './section.module.css';

interface SectionProps {
    id?: string;
    title?: ReactNode;
    description?: ReactNode;
    align?: 'start' | 'center';
    aside?: ReactNode;
    className?: string;
    children: ReactNode;
}

export function Section({ id, title, description, align = 'start', aside, className, children }: SectionProps) {
    return (
        <section id={id} className={clsx(styles.section, className)}>
            {title ? (
                <div className={clsx(aside && styles.headRow)}>
                    <div className={clsx(styles.head, align === 'center' && styles.headCenter)}>
                        <h2 className={styles.title}>{title}</h2>
                        {description ? <p className={styles.description}>{description}</p> : null}
                    </div>
                    {aside ? <div className={styles.aside}>{aside}</div> : null}
                </div>
            ) : null}
            {children}
        </section>
    );
}
