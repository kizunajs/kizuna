import type { Metadata } from 'next';
import { HandlerExplorer } from '@/components/code/handler-explorer';
import { Agents } from '@/components/landing-page/agents';
import { Beta } from '@/components/landing-page/beta';
import { BreakingChanges } from '@/components/landing-page/breaking-changes';
import { ClosingCta } from '@/components/landing-page/closing-cta';
import { Config } from '@/components/landing-page/config';
import { FeatureCards } from '@/components/landing-page/feature-cards';
import { Hero } from '@/components/landing-page/hero';
import { Sdk } from '@/components/landing-page/sdk';
import { Section } from '@/components/landing-page/section';
import { Standards } from '@/components/landing-page/standards';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: {
        absolute: 'Kizuna.js | Build fully typed REST APIs in TypeScript',
    },
    description:
        'Write one config. Get a fully typed server, typed auth, scheduled jobs, an OpenAPI spec, Swift and Kotlin clients, an MCP endpoint, and more.',
};

export default function HomePage() {
    return (
        <div className={styles.page}>
            <Hero className={styles.hero} />

            <Beta className={styles.beta} />

            <Section className={styles.cards}>
                <FeatureCards />
            </Section>

            <div className={styles.sections}>
                <Config />

                <Agents />

                <HandlerExplorer />

                <Sdk />

                <BreakingChanges />

                <Standards />

                <ClosingCta />
            </div>
        </div>
    );
}
