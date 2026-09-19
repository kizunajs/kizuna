import type { Metadata } from 'next';
import { ConfigExplorer } from '@/components/code/config-explorer';
import { HandlerExplorer } from '@/components/code/handler-explorer';
import { Adapters } from '@/components/landing-page/adapters';
import { Beta } from '@/components/landing-page/beta';
import { ClosingCta } from '@/components/landing-page/closing-cta';
import { FeatureCards } from '@/components/landing-page/feature-cards';
import { Hero } from '@/components/landing-page/hero';
import { LinkCards } from '@/components/landing-page/link-cards';
import { Section } from '@/components/landing-page/section';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: {
        absolute: 'ts-kizuna | Build fully typed REST APIs with TypeScript',
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
                <Section
                    title="The idea"
                    description="One config is the source of truth. Your server, your clients, and everything generated from it read the same declarations.">
                    <ConfigExplorer />
                </Section>

                <HandlerExplorer />

                <Section
                    title="Runs anywhere"
                    description="The same routes and handlers move between adapters, and the framework underneath stays available to you.">
                    <Adapters />
                </Section>

                <Section title="Start here">
                    <LinkCards />
                </Section>
            </div>

            <Section className={styles.cta}>
                <ClosingCta />
            </Section>
        </div>
    );
}
