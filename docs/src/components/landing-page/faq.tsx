import type { ReactNode } from 'react';
import Link from 'next/link';
import { CodeWindow } from '@/components/code/code-window';
import type { CodeCompletion } from '@/components/code/code-completion';
import TsLogo from '@/icons/TypeScript.svg';
import styles from './faq.module.css';

const TRPC_EXAMPLE = `import { createClient } from './api-client.generated';

const client = createClient({
    baseUrl: 'https://api.example.com',
});

const result = await client.users.`;

const TRPC_COMPLETION: CodeCompletion = {
    after: 'client.users.',
    items: ['getUser', 'listUsers', 'createUser'],
};

interface Question {
    question: string;
    answer: ReactNode;
}

export const questions: Question[] = [
    {
        question: 'Why Kizuna?',
        answer: (
            <>
                <p className={styles.body}>One config, a fully typed stack.</p>
                <p className={styles.body}>
                    Describe your API once. Kizuna serves it as a typed REST API, an OpenAPI document and an MCP endpoint, and generates the
                    TypeScript, Swift and Kotlin clients that call it. No copying types between repos, no docs to keep up to date by hand.
                </p>
                <p className={styles.body}>
                    Change the API and your editor shows you everything that breaks. Deprecate a field and every caller sees it before
                    it&rsquo;s gone. Frontend, backend, and mobile all come from one source, so a client cannot quietly drift from the
                    server.
                </p>
                <p className={styles.body}>
                    Agents work well against it. A route declares what it takes and what it answers, so an agent writing a caller reads the
                    same source your compiler checks it against.
                </p>
                <p className={styles.body}>
                    And it&rsquo;s real HTTP underneath: proper REST routes, correct status codes, RFC 9457 errors. More on the{' '}
                    <Link className={styles.link} href="/about">
                        about page
                    </Link>
                    .
                </p>
            </>
        ),
    },
    {
        question: "What's on the roadmap?",
        answer: (
            <>
                <p className={styles.body}>Where Kizuna is headed:</p>
                <ul className={styles.bullets}>
                    <li>OpenAPI 3.2.0 output</li>
                    <li>A TanStack Start adapter</li>
                    <li>Whatever the future brings</li>
                </ul>
            </>
        ),
    },
    {
        question: 'Why Zod only?',
        answer: (
            <p className={styles.body}>
                Kizuna won&rsquo;t support Standard Schema or other validators. It leans on Zod features directly for its inference and
                coercion, and committing to one validator is what keeps the types this precise.
            </p>
        ),
    },
    {
        question: 'Can I use my API from non-TypeScript clients?',
        answer: (
            <p className={styles.body}>
                Yes. Kizuna describes a real REST API, so anything that speaks HTTP can call it. The same routes generate native Swift and
                Kotlin clients, and are served as an OpenAPI document and an MCP endpoint.
            </p>
        ),
    },
    {
        question: 'Coming from ts-rest?',
        answer: (
            <p className={styles.body}>
                Kizuna is inspired by{' '}
                <a className={styles.link} href="https://ts-rest.com" target="_blank" rel="noreferrer">
                    ts-rest
                </a>{' '}
                and keeps the public API familiar. The{' '}
                <Link className={styles.link} href="/docs/migration/from-ts-rest">
                    migration guide
                </Link>{' '}
                maps each API to its Kizuna equivalent.
            </p>
        ),
    },
    {
        question: 'Why not just use tRPC?',
        answer: (
            <>
                <p className={styles.body}>
                    <a className={styles.link} href="https://trpc.io" target="_blank" rel="noreferrer">
                        tRPC
                    </a>{' '}
                    is a great choice for a pure TypeScript stack, and Kizuna does not ask you to give up the RPC-like client. You still
                    call your endpoints like functions and get fully typed results back:
                </p>
                <div className={styles.code}>
                    <CodeWindow
                        lang="ts"
                        code={TRPC_EXAMPLE}
                        title="src/api-client.ts"
                        icon={<TsLogo className={styles.fileIcon} />}
                        completion={TRPC_COMPLETION}
                        dots
                    />
                </div>
                <p className={styles.body}>
                    Kizuna fits better when your API has consumers outside that client: another language, a public integration, or anything
                    reading the OpenAPI spec. The same routes also generate native Swift and Kotlin clients, so your iOS and Android apps
                    are typed against the API too.
                </p>
            </>
        ),
    },
    {
        question: 'How can I help?',
        answer: (
            <>
                <p className={styles.body}>
                    We&rsquo;d love your help. Bug reports, small reproductions, and doc fixes are always welcome, and an issue or a PR for
                    any of those is a great place to start.
                </p>
                <p className={styles.body}>
                    Anything we merge into the core, we maintain, so we keep it to the packages we actually use. Whether an adapter or
                    client goes first-party comes down to adoption, not age: if a framework picks up real usage, we will very likely add it.
                    What we will not take on is a framework a handful of people use. The adapter, plugin, client, and generator APIs are all
                    public, so you can build and publish exactly what you need today: see the{' '}
                    <Link className={styles.link} href="/docs/extend/create-adapter">
                        extend guides
                    </Link>
                    .
                </p>
                <p className={styles.body}>
                    For anything beyond a bug fix or docs, like a new feature or an API change,{' '}
                    <a className={styles.link} href="https://github.com/ts-kizuna/kizuna/issues/new" target="_blank" rel="noreferrer">
                        open an issue
                    </a>{' '}
                    first so we can check it fits before you build it.
                </p>
            </>
        ),
    },
    {
        question: 'Do you offer support?',
        answer: (
            <>
                <p className={styles.body}>
                    Kizuna is open source and provided as-is. Most answers are in the docs or the source. For anything else, open an issue
                    on{' '}
                    <a className={styles.link} href="https://github.com/ts-kizuna/kizuna/issues" target="_blank" rel="noreferrer">
                        GitHub
                    </a>
                    .
                </p>
                <p className={styles.body}>
                    It is actively maintained alongside the products we ship on it, so issues get read. One with a small reproduction is the
                    quickest to act on.
                </p>
            </>
        ),
    },
];

export function Faq() {
    return (
        <div className={styles.faq}>
            {questions.map((entry) => (
                <section key={entry.question} className={styles.entry}>
                    <h2 className={styles.heading}>{entry.question}</h2>
                    {entry.answer}
                </section>
            ))}
        </div>
    );
}
