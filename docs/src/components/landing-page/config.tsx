'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Clock, KeyRound, Puzzle, Waypoints } from 'lucide-react';
import { CodeWindow } from '@/components/code/code-window';
import KotlinLogo from '@/icons/Kotlin.svg';
import ReactLogo from '@/icons/React.svg';
import SwiftLogo from '@/icons/Swift.svg';
import TanstackLogo from '@/icons/TanStack.svg';
import TsLogo from '@/icons/TypeScript.svg';
import { Section } from './section';
import panel from './panel.module.css';
import styles from './config.module.css';
import type { ComponentType } from 'react';

interface Declaration {
    icon: ComponentType<{ className?: string }>;
    label: string;
}

const declarations: Declaration[] = [
    {
        icon: Waypoints,
        label: 'Routes',
    },
    {
        icon: KeyRound,
        label: 'Auth',
    },
    {
        icon: Clock,
        label: 'Jobs',
    },
    {
        icon: Puzzle,
        label: 'Plugins',
    },
];

interface Client {
    id: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    fileIcon?: ComponentType<{ className?: string }>;
    lang: string;
    file: string;
    code: string;
}

const CLIENTS: Client[] = [
    {
        id: 'fetch',
        label: 'Fetch',
        icon: TsLogo,
        lang: 'ts',
        file: 'api-client.ts',
        code: `const apiClient = createClient({
  baseUrl: 'http://localhost:3000',
});

const res = await apiClient.users.getUser({
  params: {
    id: '1',
  },
});

if (res.status === 200) {
  res.body; // User, fully typed
} else {
  throw new Error(res.body.detail);
}`,
    },
    {
        id: 'tanstack',
        label: 'TanStack',
        icon: TanstackLogo,
        fileIcon: ReactLogo,
        lang: 'tsx',
        file: 'user-list.tsx',
        code: `const api = new KizunaTanstackQuery(apiClient);

const { data } = useQuery(
  api.users.getUser.queryOptions({
    input: {
      params: {
        id: '1',
      },
    },
  })
);

// invalidate every users query
queryClient.invalidateQueries({
  queryKey: api.users.key(),
});`,
    },
    {
        id: 'swift',
        label: 'Swift',
        icon: SwiftLogo,
        lang: 'swift',
        file: 'UserService.swift',
        code: `let client = APIClient(
  baseURL: URL(string: "http://localhost:3000")!
)

do {
  let res = try await client.users.getUser(
    .params(
      id: "1"
    )
  )
  res.body // User, Codable
} catch {
  error // typed failure (e.g. .notFound)
}`,
    },
    {
        id: 'kotlin',
        label: 'Kotlin',
        icon: KotlinLogo,
        lang: 'kotlin',
        file: 'APIClient.kt',
        code: `val client = APIClient(
  baseUrl = "http://localhost:3000"
)

try {
  val res = client.users.getUser {
    params(
      id = "1"
    )
  }
  res.body // User, @Serializable
} catch (error: APIClient.UsersGetUser.Failure.NotFound) {
  error.body.detail // typed failure
}`,
    },
];

const OPENAPI_CODE = `/users/{id}:
  get:
    operationId: getUser
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    responses:
      '200':
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/User'`;

const VALIDATION_CODE = `POST /users HTTP/1.1

{ "name": "Ada", "email": "nope" }

HTTP/1.1 400 Bad Request
content-type: application/problem+json

{
  "title": "Bad Request",
  "detail": "Invalid request body",
  "errors": [
    {
      "code": "invalid_format",
      "path": ["email"],
      "message": "Invalid email address"
    }
  ]
}`;

export function Config() {
    const [clientId, setClientId] = useState(CLIENTS[0].id);

    return (
        <Section
            className={styles.root}
            align="center"
            title={
                <>
                    One config. <br />
                    Everything reads from it.
                </>
            }
            description="Write it in TypeScript with Zod. The clients, the OpenAPI spec, and request validation follow, typed end to end.">
            <div className={styles.chips}>
                {declarations.map((declaration) => (
                    <span key={declaration.label} className={styles.chipCell}>
                        <span className={styles.chip}>
                            <declaration.icon className={styles.chipIcon} aria-hidden />
                            {declaration.label}
                        </span>
                    </span>
                ))}
            </div>

            <div className={styles.joinIn} aria-hidden />

            <div className={styles.terminal}>
                <div className={styles.terminalBar}>
                    <span className={styles.terminalDots}>
                        <span className={styles.terminalDot} />
                        <span className={styles.terminalDot} />
                        <span className={styles.terminalDot} />
                    </span>
                    <span className={styles.terminalTitle}>kizuna.config.ts</span>
                </div>
            </div>

            <div className={styles.joinOut} aria-hidden>
                <span className={styles.joinOutDrop} />
                <span className={styles.joinOutRail} />
                <span className={styles.joinOutStub} />
                <span className={styles.joinOutStub} />
                <span className={styles.joinOutStub} />
                <span className={styles.joinOutDot} />
                <span className={styles.joinOutDot} />
                <span className={styles.joinOutDot} />
            </div>

            <div className={styles.columns}>
                <article className={panel.panel}>
                    <div className={panel.visual}>
                        <div className={styles.clientTabsFrame}>
                            <div className={styles.clientTabs} role="tablist" aria-label="Clients">
                                {CLIENTS.map((client) => (
                                    <button
                                        key={client.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={client.id === clientId}
                                        aria-label={client.label}
                                        onClick={() => setClientId(client.id)}
                                        className={clsx(styles.clientTab, client.id === clientId && styles.clientTabActive)}>
                                        <client.icon aria-hidden />
                                        <span className={styles.clientLabel}>{client.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className={clsx(styles.frame, styles.frameShort)}>
                            <div className={panel.scene}>
                                {CLIENTS.map((client) => {
                                    const FileIcon = client.fileIcon ?? client.icon;

                                    return (
                                        <div
                                            key={client.id}
                                            aria-hidden={client.id !== clientId}
                                            className={clsx(panel.sceneItem, client.id !== clientId && panel.sceneItemHidden)}>
                                            <CodeWindow
                                                lang={client.lang}
                                                code={client.code}
                                                title={client.file}
                                                icon={<FileIcon className={styles.fileIcon} />}
                                                dots
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className={panel.body}>
                        <Link href="/docs/clients/fetch" className={panel.title}>
                            Clients
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>Typed fetch and TanStack Query, plus generated Swift and Kotlin.</p>
                    </div>
                </article>

                <article className={panel.panel}>
                    <div className={clsx(panel.visual, styles.frame)}>
                        <CodeWindow lang="yaml" code={OPENAPI_CODE} title="openapi.yaml" dots />
                    </div>
                    <div className={panel.body}>
                        <Link href="/docs/openapi" className={panel.title}>
                            OpenAPI
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>A complete spec generated from your routes, no annotations needed.</p>
                    </div>
                </article>

                <article className={panel.panel}>
                    <div className={clsx(panel.visual, styles.frame)}>
                        <CodeWindow lang="http" code={VALIDATION_CODE} title="localhost:3000" dots />
                    </div>
                    <div className={panel.body}>
                        <Link href="/docs/routes" className={panel.title}>
                            Validation
                            <ArrowRight className={panel.arrow} aria-hidden />
                        </Link>
                        <p className={panel.text}>Bad requests answered as Problem Details before your handler runs.</p>
                    </div>
                </article>
            </div>
        </Section>
    );
}
