import type { Metadata } from 'next';
import { About, AboutName } from '@/components/landing-page/about';
import { ClosingCta } from '@/components/landing-page/closing-cta';
import { Maintainers } from '@/components/landing-page/maintainers';
import { PageHead } from '@/components/landing-page/page-head';
import styles from '../subpage.module.css';

export const metadata: Metadata = {
    title: 'About',
    description: 'The idea behind Kizuna.js.',
    robots: {
        index: false,
        follow: false,
    },
};

export default function AboutPage() {
    return (
        <div className={styles.page}>
            <PageHead
                className={styles.introTight}
                label="About"
                title="Why we built Kizuna.js"
                description="The goal is simple: make it impossible to ship a client that has drifted from your API."
            />

            <div className={styles.stack}>
                <About />
                <div className={styles.pair}>
                    <AboutName />
                    <Maintainers />
                </div>
            </div>

            <ClosingCta className={styles.closing} />
        </div>
    );
}
