import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import GithubIcon from '@/icons/Github.svg';
import LogoMark from '@/icons/LogoMark.svg';
import styles from './closing-cta.module.css';

interface ClosingCtaProps {
    title?: string;
    text?: string;
    href?: string;
    className?: string;
}

export function ClosingCta({
    title = 'Ready to build?',
    text = '8 minutes from an empty file to a typed client calling a real endpoint.',
    href = '/docs/quickstart',
    className,
}: ClosingCtaProps) {
    return (
        <section className={clsx(styles.closingCta, className)}>
            <span className={styles.mark}>
                <LogoMark />
            </span>
            <h2 className={styles.ctaTitle}>{title}</h2>
            <p className={styles.ctaText}>{text}</p>
            <div className={styles.ctaActions}>
                <ButtonLink href={href}>
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
