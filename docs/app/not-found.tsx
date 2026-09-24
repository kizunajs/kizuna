import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { PageHead } from '@/components/landing-page/page-head';
import { SiteFooter } from '@/components/landing-page/site-footer';
import { SiteHeader } from '@/components/landing-page/site-header';
import { ButtonLink } from '@/components/ui/button';
import styles from './not-found.module.css';

export const metadata: Metadata = {
    title: 'Page not found',
};

export default function NotFound() {
    return (
        <div className="kizuna-landing-page">
            <SiteHeader />
            <main className={styles.main}>
                <PageHead label="404" title="Page not found" description="The page you are looking for does not exist.">
                    <ButtonLink href="/">
                        Back home
                        <ArrowRight aria-hidden />
                    </ButtonLink>
                    <ButtonLink href="/docs" variant="secondary">
                        Read the docs
                    </ButtonLink>
                </PageHead>
            </main>
            <SiteFooter />
        </div>
    );
}
