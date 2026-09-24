import clsx from 'clsx';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './cards.module.css';

export function Cards({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={clsx(styles.cards, className)}>{children}</div>;
}

interface CardProps {
    title: ReactNode;
    href?: string;
    description?: ReactNode;
    children?: ReactNode;
}

export function Card({ title, href, description, children }: CardProps) {
    const content = (
        <>
            <span className={styles.title}>
                {title}
                {href ? <ArrowRight className={styles.arrow} aria-hidden /> : null}
            </span>
            {description || children ? <div className={styles.text}>{description ?? children}</div> : null}
        </>
    );

    if (!href) return <div className={styles.card}>{content}</div>;

    return (
        <Link href={href} className={styles.card}>
            {content}
        </Link>
    );
}
