import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { HeroBackdrop } from './hero-backdrop';
import { InstallCommand } from './install-command';
import styles from './hero.module.css';

export function Hero({ className }: { className?: string }) {
    return (
        <section className={clsx(styles.hero, className)}>
            <HeroBackdrop className={styles.backdrop} />

            <h1 className={styles.headline}>Build fully typed REST APIs in TypeScript</h1>
            <p className={styles.tagline}>
                Write one config. Get a fully typed server, an OpenAPI spec, Swift and Kotlin clients, and more.
            </p>

            <div className={styles.actions}>
                <ButtonLink href="/docs/quickstart">
                    Get started
                    <ArrowRight aria-hidden />
                </ButtonLink>
                <InstallCommand />
            </div>
        </section>
    );
}
