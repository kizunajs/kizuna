import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Check, Minus, X } from 'lucide-react';
import LogoMark from '@/icons/LogoMark.svg';
import styles from './comparison.module.css';

type Mark = 'yes' | 'partly' | 'no';

const marks: Record<Mark, { icon: typeof Check; label: string }> = {
    yes: {
        icon: Check,
        label: 'Yes',
    },
    partly: {
        icon: Minus,
        label: 'Partly',
    },
    no: {
        icon: X,
        label: 'No',
    },
};

function Cell({ mark, children }: { mark?: Mark; children: ReactNode }) {
    const MarkIcon = mark === undefined ? undefined : marks[mark].icon;
    return (
        <div className={clsx(styles.cell, mark !== undefined && styles[mark])}>
            {MarkIcon ? (
                <span className={styles.mark} aria-label={marks[mark!].label}>
                    <MarkIcon aria-hidden />
                </span>
            ) : null}
            <span className={styles.cellText}>{children}</span>
        </div>
    );
}

interface RowProps {
    label: ReactNode;
    kizuna: ReactNode;
    other: ReactNode;
    kizunaMark?: Mark;
    otherMark?: Mark;
}

/**
 * One line of a comparison: what it is about, then Kizuna's answer and the
 * other's. A mark says at a glance whether a side has it.
 */
export function Row({ label, kizuna, other, kizunaMark, otherMark }: RowProps) {
    return (
        <div className={styles.row} role="row">
            <div className={styles.label} role="rowheader">
                {label}
            </div>
            <div role="cell">
                <Cell mark={kizunaMark}>{kizuna}</Cell>
            </div>
            <div role="cell">
                <Cell mark={otherMark}>{other}</Cell>
            </div>
        </div>
    );
}

/**
 * Kizuna CMS beside another CMS, one row per thing that differs.
 */
export function Comparison({ first, other, children }: { first?: ReactNode; other: ReactNode; children: ReactNode }) {
    return (
        <div className={styles.table} role="table">
            <div className={clsx(styles.row, styles.head)} role="row">
                <div role="columnheader" />
                <div className={styles.name} role="columnheader">
                    {first ?? (
                        <>
                            <LogoMark className={styles.logo} aria-hidden />
                            Kizuna CMS
                        </>
                    )}
                </div>
                <div className={styles.name} role="columnheader">
                    {other}
                </div>
            </div>
            {children}
        </div>
    );
}

/**
 * A sequence, one step after another.
 */
export function Flow({ steps }: { steps: ReactNode[] }) {
    return (
        <ol className={styles.flow}>
            {steps.map((step, index) => (
                <li key={index} className={styles.step}>
                    <span className={styles.stepText}>{step}</span>
                </li>
            ))}
        </ol>
    );
}

/**
 * Two code blocks beside each other, the same thing written both ways.
 */
export function SideBySide({ children }: { children: ReactNode }) {
    return <div className={styles.sideBySide}>{children}</div>;
}
