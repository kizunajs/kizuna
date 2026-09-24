import type { Metadata } from 'next';
import { ComparisonTable, WhichFits } from '@/components/landing-page/comparison';
import { ClosingCta } from '@/components/landing-page/closing-cta';
import { PageHead } from '@/components/landing-page/page-head';
import { Section } from '@/components/landing-page/section';
import styles from '../subpage.module.css';

export const metadata: Metadata = {
    title: 'Compare',
    description: 'How Kizuna.js compares with ts-rest, tRPC, oRPC and Hono.',
};

export default function ComparePage() {
    return (
        <div className={styles.page}>
            <PageHead
                label="Compare"
                title="How Kizuna.js compares"
                description="ts-rest, tRPC, oRPC and Hono all give you a typed TypeScript API. Here is where each one fits."
            />

            <ComparisonTable />

            <Section title="Which one fits">
                <WhichFits />
            </Section>

            <ClosingCta className={styles.closing} />
        </div>
    );
}
