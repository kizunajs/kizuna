import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ComponentType } from 'react';
import { CodeWindow } from '@/components/code/code-window';
import KotlinLogo from '@/icons/Kotlin.svg';
import SwiftLogo from '@/icons/Swift.svg';
import TsLogo from '@/icons/TypeScript.svg';
import { DocsLink } from '@/components/landing-page/docs-link';
import { Section } from './section';
import panel from './panel.module.css';
import styles from './sdk.module.css';

interface Package {
    title: string;
    href: string;
    icon: ComponentType<{ className?: string }>;
    lang: string;
    file: string;
    code: string;
    text: string;
}

const packages: Package[] = [
    {
        title: 'npm',
        href: '/docs/clients/fetch',
        icon: TsLogo,
        lang: 'ts',
        file: 'src/app.ts',
        code: `import { AcmeClient } from '@acme/sdk';

const acme = AcmeClient({
    baseUrl: 'https://api.acme.com',
});

const user = await acme.users.getUser({
    params: {
        id: '42',
    },
});`,
        text: 'A TypeScript package for browsers, Node and React Native.',
    },
    {
        title: 'Swift Package Manager',
        href: '/docs/clients/swift',
        icon: SwiftLogo,
        lang: 'swift',
        file: 'UserService.swift',
        code: `import AcmeSDK

let acme = AcmeClient(
    baseURL: URL(string: "https://api.acme.com")!
)

let user = try await acme.users.getUser(
    .params(
        id: "42"
    )
)`,
        text: 'A Swift package with no dependencies, ready for iOS and macOS apps.',
    },
    {
        title: 'Maven',
        href: '/docs/clients/kotlin',
        icon: KotlinLogo,
        lang: 'kotlin',
        file: 'UserRepository.kt',
        code: `import com.acme.sdk.AcmeClient

val acme = AcmeClient(
    baseUrl = "https://api.acme.com"
)

val user = acme.users.getUser {
    params(
        id = "42"
    )
}`,
        text: 'A Kotlin library for Android and JVM apps, built on OkHttp and kotlinx.serialization.',
    },
];

export function Sdk() {
    return (
        <Section
            aside={<DocsLink href="/docs/clients/fetch" />}
            title="Ship your API as an SDK"
            description="Publish what Kizuna generates, and your customers get the typed SDK you would otherwise write and maintain by hand.">
            <div className={styles.panels}>
                {packages.map((entry) => (
                    <article key={entry.title} className={panel.panel}>
                        <div className={styles.visual}>
                            <CodeWindow
                                lang={entry.lang}
                                code={entry.code}
                                title={entry.file}
                                icon={<entry.icon className={styles.fileIcon} />}
                                dots
                            />
                        </div>
                        <div className={panel.body}>
                            <Link href={entry.href} className={panel.title}>
                                {entry.title}
                                <ArrowRight className={panel.arrow} aria-hidden />
                            </Link>
                            <p className={panel.text}>{entry.text}</p>
                        </div>
                    </article>
                ))}
            </div>
        </Section>
    );
}
