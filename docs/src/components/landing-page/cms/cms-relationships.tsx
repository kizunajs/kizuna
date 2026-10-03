'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ArrowRight, Calendar, CreditCard, Package, Server, UserRound } from 'lucide-react';
import { CodeWindow } from '@/components/code/code-window';
import LogoMark from '@/icons/LogoMark.svg';
import ShopifyLogo from '@/icons/Shopify.svg';
import StripeLogo from '@/icons/Stripe.svg';
import { DocsLink } from '../docs-link';
import { Section } from '../section';
import panel from '../panel.module.css';
import { Picker } from './cms-editor-mock';
import styles from './cms-relationships.module.css';

interface Source {
    key: string;
    name: string;
    icon: ReactNode;
    field: string;
    query: string;
    thumb: ReactNode;
    chosen: {
        id: string;
        label: string;
    }[];
    others: string[];
    file: string;
    code: string;
}

const sources: Source[] = [
    {
        key: 'kizuna',
        name: 'Kizuna API',
        icon: <LogoMark aria-hidden />,
        field: 'events',
        query: 'meetup',
        thumb: <Calendar aria-hidden />,
        chosen: [
            {
                id: 'evt_7Hq2',
                label: 'Oslo meetup',
            },
            {
                id: 'evt_9Kd4',
                label: 'Bergen meetup',
            },
        ],
        others: ['Trondheim meetup', 'Stavanger meetup'],
        file: 'src/app/events/page.tsx',
        code: `const result = await apiClient.events.listEvents({
    query: {
        ids: content.events,
    },
});`,
    },
    {
        key: 'api',
        name: 'Any API',
        icon: <Server aria-hidden />,
        field: 'team',
        query: 'design',
        thumb: <UserRound aria-hidden />,
        chosen: [
            {
                id: 'emp_412',
                label: 'Aiko Tanaka',
            },
            {
                id: 'emp_538',
                label: 'Daniel Moreau',
            },
        ],
        others: ['Sara Lindqvist', 'Marco Reyes'],
        file: 'src/app/team/page.tsx',
        code: `const response = await fetch(
    \`https://hr.example.com/people?ids=\${content.team}\`,
);
const people: Person[] = await response.json();`,
    },
    {
        key: 'stripe',
        name: 'Stripe',
        icon: <StripeLogo aria-hidden />,
        field: 'plans',
        query: 'monthly',
        thumb: <CreditCard aria-hidden />,
        chosen: [
            {
                id: 'price_1QfPro',
                label: 'Pro, monthly',
            },
            {
                id: 'price_1QfTeam',
                label: 'Team, monthly',
            },
        ],
        others: ['Starter, monthly', 'Enterprise, monthly'],
        file: 'src/app/pricing/page.tsx',
        code: `const plans = await Promise.all(
    content.plans.map((id) =>
        stripe.prices.retrieve(id),
    ),
);`,
    },
    {
        key: 'shopify',
        name: 'Shopify',
        icon: <ShopifyLogo aria-hidden />,
        field: 'featured',
        query: 'desk',
        thumb: <Package aria-hidden />,
        chosen: [
            {
                id: 'gid://shopify/Product/8812',
                label: 'Desk lamp',
            },
            {
                id: 'gid://shopify/Product/8840',
                label: 'Desk mat',
            },
        ],
        others: ['Desk shelf', 'Desk organiser'],
        file: 'src/app/(front-page)/page.tsx',
        code: `const { data } = await shopify.request(PRODUCTS, {
    variables: {
        ids: content.featured,
    },
});`,
    },
];

function Wire({ className }: { className: string }) {
    return <span className={clsx(styles.wire, className)} aria-hidden />;
}

export function CmsRelationships() {
    const [active, setActive] = useState(sources[0].key);
    const source = sources.find((candidate) => candidate.key === active) ?? sources[0];

    return (
        <Section
            aside={<DocsLink href="/docs/cms/content#relationships" />}
            title="Your data, right where it is"
            description="Products, prices and events stay where they live. Editors pick them, and the page fetches what it shows.">
            <article className={panel.panel}>
                <div className={styles.flow}>
                    <div className={styles.sources} role="tablist" aria-label="Where the records live">
                        {sources.map((candidate) => (
                            <button
                                key={candidate.key}
                                type="button"
                                role="tab"
                                aria-selected={candidate.key === active}
                                onClick={() => setActive(candidate.key)}
                                className={clsx(panel.tab, candidate.key === active && panel.tabActive)}>
                                {candidate.icon}
                                {candidate.name}
                            </button>
                        ))}
                    </div>

                    <div className={styles.steps}>
                        <p className={clsx(styles.stepTitle, styles.first)}>
                            <span className={styles.number}>1</span>
                            Editors pick
                        </p>
                        <p className={clsx(styles.stepTitle, styles.second)}>
                            <span className={styles.number}>2</span>
                            The page keeps ids
                        </p>
                        <p className={clsx(styles.stepTitle, styles.third)}>
                            <span className={styles.number}>3</span>
                            {source.key === 'kizuna'
                                ? 'The page calls the SDK'
                                : `The page asks ${source.key === 'api' ? 'the API' : source.name}`}
                        </p>

                        <div className={clsx(styles.visual, styles.first)}>
                            <Picker
                                className={styles.picker}
                                query={source.query}
                                options={[
                                    ...source.chosen.map((record) => ({
                                        label: record.label,
                                        icon: source.thumb,
                                        chosen: true,
                                    })),
                                    ...source.others.map((label) => ({
                                        label,
                                        icon: source.thumb,
                                    })),
                                ]}
                            />
                        </div>
                        <Wire className={styles.wireOne} />
                        <div className={clsx(styles.visual, styles.second)}>
                            <div className={styles.ids}>
                                <span className={styles.idsKey}>{source.field}</span>
                                {source.chosen.map((record) => (
                                    <span key={record.id} className={styles.id}>
                                        {record.id}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <Wire className={styles.wireTwo} />
                        <div className={clsx(styles.visual, styles.third)}>
                            <div className={styles.code}>
                                <CodeWindow key={source.key} lang="ts" code={source.code} title={source.file} size="small" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className={panel.body}>
                    <Link href="/docs/cms/content#collection-or-your-own-table" className={panel.title}>
                        Content, or a record of yours
                        <ArrowRight className={panel.arrow} aria-hidden />
                    </Link>
                    <p className={panel.text}>
                        Articles live in the CMS. Records in your APIs, Stripe or Shopify stay there, and the CMS never copies them.
                    </p>
                </div>
            </article>
        </Section>
    );
}
