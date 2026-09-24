import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import GithubIcon from '@/icons/Github.svg';
import LogoMark from '@/icons/LogoMark.svg';
import styles from './closing-cta.module.css';

export function ClosingCta({ className }: { className?: string }) {
    return (
        <section className={clsx(styles.closingCta, className)}>
            <span className={styles.mark}>
                <LogoMark />
            </span>
            <h2 className={styles.ctaTitle}>Ready to build?</h2>
            <p className={styles.ctaText}>8 minutes from an empty file to a typed client calling a real endpoint.</p>
            <div className={styles.ctaActions}>
                <ButtonLink href="/docs/quickstart">
                    Get started
                    <ArrowRight aria-hidden />
                </ButtonLink>
                <ButtonLink href="https://github.com/kizunajs/kizuna" variant="secondary">
                    <GithubIcon />
                    Star on GitHub
                </ButtonLink>
            </div>
        </section>
    );
}
