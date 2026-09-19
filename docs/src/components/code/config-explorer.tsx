import clsx from 'clsx';
import type { ReactNode } from 'react';
import { FileText, Globe, Radio, Server, ShieldCheck, Timer, TriangleAlert } from 'lucide-react';
import { CodeWindow } from './code-window';
import { ClaudeWindow } from './claude-window';
import KotlinLogo from '@/icons/Kotlin.svg';
import McpLogo from '@/icons/Mcp.svg';
import SwiftLogo from '@/icons/Swift.svg';
import TanstackLogo from '@/icons/TanStack.svg';
import TsLogo from '@/icons/TypeScript.svg';
import styles from './config-explorer.module.css';

const icons = {
    server: <Server className={styles.icon} />,
    file: <FileText className={styles.icon} />,
    alert: <TriangleAlert className={styles.icon} />,
    globe: <Globe className={styles.icon} />,
    shield: <ShieldCheck className={styles.icon} />,
    radio: <Radio className={styles.icon} />,
    timer: <Timer className={styles.icon} />,
};

const brandIcons = {
    typescript: <TsLogo key="ts" className={styles.brandIcon} />,
    swift: <SwiftLogo key="swift" className={styles.brandIcon} />,
    kotlin: <KotlinLogo key="kotlin" className={styles.brandIcon} />,
};

const methodStyles = {
    GET: styles.methodGet,
    POST: styles.methodPost,
    PUT: styles.methodWrite,
    PATCH: styles.methodWrite,
    DELETE: styles.methodDelete,
};

function Method({ name }: { name: keyof typeof methodStyles }) {
    return <span className={clsx(styles.method, methodStyles[name])}>{name}</span>;
}

interface CodeOutputNode {
    icon: ReactNode;
    label: string;
    description: string;
    file: string;
    fileIcon?: ReactNode;
    lang: string;
    code: string;
}

interface CustomOutputNode {
    icon: ReactNode;
    label: string;
    description: string;
    content: ReactNode;
}

type OutputNode = CodeOutputNode | CustomOutputNode;

const NODES: OutputNode[] = [
    {
        icon: icons.file,
        label: 'OpenAPI',
        description: 'Generated from your config',
        file: 'openapi.yaml',
        lang: 'yaml',
        code: `/users/{id}:
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
              $ref: '#/components/schemas/User'
      '404':
        content:
          application/problem+json:
            schema:
              $ref: '#/components/schemas/ProblemDetails'`,
    },
    {
        icon: icons.globe,
        label: 'REST',
        description: 'Every route is a real REST endpoint',
        file: 'localhost:3000/users/1',
        fileIcon: <Method name="GET" />,
        lang: 'http',
        code: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "1",
  "name": "Ada"
}

HTTP/1.1 404 Not Found
Content-Type: application/problem+json

{
  "type": "about:blank",
  "status": 404,
  "detail": "Not found"
}`,
    },
    {
        icon: <TsLogo className={styles.icon} />,
        label: 'TypeScript client',
        description: 'Call your API like a function',
        file: 'api-client.ts',
        fileIcon: brandIcons.typescript,
        lang: 'ts',
        code: `const apiClient = new KizunaClient(kizuna.api, {
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
        icon: <TanstackLogo className={styles.icon} />,
        label: 'TanStack Query client',
        description: 'Query and mutation options, keys included',
        file: 'user-list.tsx',
        fileIcon: brandIcons.typescript,
        lang: 'tsx',
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
        icon: <SwiftLogo className={styles.icon} />,
        label: 'Swift client',
        description: 'A native client for iOS and macOS',
        file: 'UserService.swift',
        fileIcon: brandIcons.swift,
        lang: 'swift',
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
        icon: <KotlinLogo className={styles.icon} />,
        label: 'Kotlin client',
        description: 'A native client for Android and the JVM',
        file: 'APIClient.kt',
        fileIcon: brandIcons.kotlin,
        lang: 'kotlin',
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
    {
        icon: <McpLogo className={styles.icon} />,
        label: 'MCP endpoint',
        description: 'Routes declaring a tool, for AI agents',
        content: <ClaudeWindow />,
    },
    {
        icon: icons.shield,
        label: 'Built-in validation',
        description: 'Every request checked against its route',
        file: 'localhost:3000/users',
        fileIcon: <Method name="POST" />,
        lang: 'http',
        code: `{
  "name": "Ada",
  "email": "nope"
}

HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "status": 400,
  "errors": [
    { "code": "invalid_string_format",
      "path": ["email"],
      "message": "Invalid email" }
  ]
}`,
    },
    {
        icon: icons.alert,
        label: 'Deprecation and sunset',
        description: 'Phase out routes, with warnings everywhere',
        file: 'routes.ts',
        fileIcon: brandIcons.typescript,
        lang: 'ts',
        code: `searchUsers: {
  deprecated: {
    message: 'use listUsers instead',
    date: '2026-03-01',
  },
  sunset: '2027-01-01',
  ...
}

// Editor strikethrough
// OpenAPI deprecated: true
// Swift @available(*, deprecated, message: "use listUsers instead")
// Kotlin @Deprecated("use listUsers instead")
// HTTP Deprecation: @1772323200
// HTTP Sunset: Fri, 01 Jan 2027 00:00:00 GMT`,
    },
    {
        icon: icons.radio,
        label: 'Streaming',
        description: 'Typed events sent as they happen',
        file: 'router.ts',
        fileIcon: brandIcons.typescript,
        lang: 'ts',
        code: `reply: async ({ body }) => ({
  status: 200,
  body: async function* ({ signal }) {
    const stream = anthropic.messages.stream(
      {
        model: 'claude-opus-5',
        max_tokens: 64000,
        messages: [
          {
            role: 'user',
            content: body.prompt,
          },
        ],
      },
      { signal }
    );
    for await (const text of textDeltas(stream)) {
      yield { event: 'delta', data: { text } };
    }
    const { usage } = await stream.finalMessage();
    yield { event: 'done', data: { outputTokens: usage.output_tokens } };
  },
}),`,
    },
    {
        icon: icons.timer,
        label: 'Caching',
        description: 'Cache headers declared on the response',
        file: 'routes.ts',
        fileIcon: brandIcons.typescript,
        lang: 'ts',
        code: `listEvents: {
  method: 'GET',
  path: '/events',
  responses: {
    200: {
      body: z.array(EventSchema),
      cache: {
        scope: 'public',
        sharedMaxAge: 600, // ten minutes on the CDN
        staleWhileRevalidate: 60,
      },
    },
    404: {
      body: ProblemDetailsSchema,
      cache: {
        scope: 'public',
        maxAge: 60, // misses are cached too
      },
    },
  },
}

// Cache-Control: public, s-maxage=600, stale-while-revalidate=60`,
    },
];

const CONFIG_CODE = `const UserSchema = Kizuna.model({ // a named User in OpenAPI, Swift, and Kotlin
  title: 'User',
  schema: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

export const users = k.routes('users', {
  getUser: k
    .route({
      method: 'GET',
      path: '/users/:id',
      auth: 'user',
      responses: {
        200: UserSchema,
        404: ProblemDetailsSchema, // or .extend({ ... }) to add fields
      },
    })
    .handler(async ({ params, auth }) => ({
      status: 200,
      body: await db.users.find(params.id, auth.user.userId),
    })),
});

// kizuna.config.ts
export default defineConfig({
  adapter: expressAdapter(),
  routes: {
    users,
  },
  auth: {
    identities: {
      user,
    },
  },
});`;

export function ConfigExplorer({ className }: { className?: string }) {
    return (
        <div className={clsx(styles.root, className)}>
            <div className={styles.card}>
                <CodeWindow lang="ts" code={CONFIG_CODE} title="kizuna.config.ts" icon={brandIcons.typescript} dots />
            </div>
            <div className={styles.connector}>
                <svg
                    className={styles.connectorIcon}
                    viewBox="0 0 24 48"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden>
                    <path d="M12 3v38" />
                    <path d="m2 32 10 9 10-9" />
                </svg>
            </div>
            <div className={styles.grid}>
                {NODES.map((node) => (
                    <div key={node.label} className={styles.card}>
                        <div className={styles.cardHead}>
                            <span className={styles.chip}>{node.icon}</span>
                            <div>
                                <div className={styles.nodeLabel}>{node.label}</div>
                                <div className={styles.nodeDescription}>{node.description}</div>
                            </div>
                        </div>
                        {'code' in node ? (
                            <CodeWindow lang={node.lang} code={node.code} title={node.file} icon={node.fileIcon} dots />
                        ) : (
                            node.content
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
