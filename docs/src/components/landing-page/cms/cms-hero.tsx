import clsx from 'clsx';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/shared/badge';
import { ButtonLink } from '@/components/ui/button';
import { HeroBackdrop } from '../hero-backdrop';
import hero from '../hero.module.css';
import beta from '../beta.module.css';

export function CmsHero({ className }: { className?: string }) {
    return (
        <section className={clsx(hero.hero, className)}>
            <HeroBackdrop className={hero.backdrop} />

            <h1 className={hero.headline}>The content platform for your whole business</h1>
            <p className={hero.tagline}>
                Declare the fields beside the route. Get the editor in your chat, the preview, a typed content API, and more.
            </p>

            <div className={hero.actions}>
                <ButtonLink href="/docs/cms/quickstart">
                    Get started
                    <ArrowRight aria-hidden />
                </ButtonLink>
                <ButtonLink href="/docs/cms" variant="secondary">
                    What is Kizuna CMS?
                </ButtonLink>
            </div>
        </section>
    );
}

export function CmsAlpha({ className }: { className?: string }) {
    return (
        <div className={clsx(beta.beta, className)}>
            <Badge stage="alpha" size="medium" />
            <p className={beta.body}>
                <span className={beta.bodyLong}>New in v2 and still settling, so its routes, options and generated files may change.</span>
                <span className={beta.bodyShort}>New and still settling.</span>
            </p>
            <Link className={beta.link} href="/docs/cms">
                Read the docs
            </Link>
        </div>
    );
}
