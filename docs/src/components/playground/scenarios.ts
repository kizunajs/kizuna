export interface Call {
    label: string;
    scope?: Record<string, unknown>;
    deprecated?: {
        symbol: string;
        message: string;
    };
    typescript: string;
    swift: string;
    kotlin: string;
}

export interface Scenario {
    id: string;
    title: string;
    summary: string;
    source: string;
    calls: Call[];
}

const users = `import { Kizuna, defineConfig } from 'kizunajs';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { honoAdapter } from '@kizunajs/hono';
import { z } from 'zod';

const k = new Kizuna();

export const UserSchema = Kizuna.model({
    title: 'User',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        email: z.email(),
    }),
});

export const getUser = k
    .route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: UserSchema,
            404: ProblemDetailsSchema,
        },
    })
    .handler(async ({ params }) => {
        if (params.id !== '1') {
            return {
                status: 404,
                body: {
                    detail: \`No user with id \${params.id}\`,
                },
            };
        }

        return {
            status: 200,
            body: {
                id: '1',
                name: 'Ada Lovelace',
                email: 'ada@example.com',
            },
        };
    });

export const users = k.routes({
    getUser,
});

export default defineConfig({
    adapter: honoAdapter(),
    routes: {
        users,
    },
});
`;

const validation = `import { Kizuna, defineConfig } from 'kizunajs';
import { honoAdapter } from '@kizunajs/hono';
import { z } from 'zod';

const k = new Kizuna();

export const createUser = k
    .route({
        method: 'POST',
        path: '/users',
        body: z.object({
            name: z.string().min(1),
            email: z.email(),
        }),
        responses: {
            201: z.object({
                id: z.string(),
                name: z.string(),
                email: z.email(),
            }),
        },
    })
    .handler(async ({ body }) => ({
        status: 201,
        body: {
            id: '2',
            ...body,
        },
    }));

export const users = k.routes({
    createUser,
});

export default defineConfig({
    adapter: honoAdapter(),
    routes: {
        users,
    },
});
`;

const deprecation = `import { Kizuna, defineConfig } from 'kizunajs';
import { honoAdapter } from '@kizunajs/hono';
import { z } from 'zod';

const k = new Kizuna();

export const deleteUser = k
    .route({
        method: 'DELETE',
        path: '/users/:id',
        deprecated: {
            message: 'use archiveUser instead',
            date: '2026-03-01',
            link: 'https://kizunajs.com/docs/deprecations',
        },
        sunset: '2027-01-01',
        responses: {
            204: z.void(),
        },
    })
    .handler(async () => ({
        status: 204,
    }));

export const users = k.routes({
    deleteUser,
});

export default defineConfig({
    adapter: honoAdapter(),
    routes: {
        users,
    },
});
`;

const streaming = `import { Kizuna, defineConfig } from 'kizunajs';
import { honoAdapter } from '@kizunajs/hono';
import { z } from 'zod';

const k = new Kizuna();

const words = ['Every', 'client', 'reads', 'the', 'same', 'typed', 'events.'];

export const reply = k
    .route({
        method: 'POST',
        path: '/assistant/reply',
        body: z.object({
            prompt: z.string().min(1),
        }),
        responses: {
            200: {
                stream: {
                    delta: z.object({
                        text: z.string(),
                    }),
                    done: z.object({
                        words: z.int(),
                    }),
                },
            },
        },
    })
    .handler(async () => ({
        status: 200,
        body: async function* () {
            for (const word of words) {
                await new Promise((resolve) => setTimeout(resolve, 160));
                yield {
                    event: 'delta',
                    data: {
                        text: \`\${word} \`,
                    },
                };
            }
            yield {
                event: 'done',
                data: {
                    words: words.length,
                },
            };
        },
    }));

export const assistant = k.routes({
    reply,
});

export default defineConfig({
    adapter: honoAdapter(),
    routes: {
        assistant,
    },
});
`;

const authentication = `import { Kizuna, defineConfig } from 'kizunajs';
import { honoAdapter } from '@kizunajs/hono';
import { z } from 'zod';

const sessions = new Map([
    [
        'mF_9.B5f-4.1JqM',
        {
            userId: '1',
        },
    ],
]);

async function verifySession(token: string) {
    return sessions.get(token);
}

const k = new Kizuna();

export const user = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(async ({ bearer, deny }) => {
        const session = bearer ? await verifySession(bearer.token) : undefined;

        if (!session) {
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                },
            });
        }

        return {
            userId: session.userId,
        };
    });

export const getProfile = k
    .route({
        method: 'GET',
        path: '/profile',
        auth: 'user',
        responses: {
            200: z.object({
                id: z.string(),
                name: z.string(),
            }),
        },
    })
    .handler(async ({ auth }) => ({
        status: 200,
        body: {
            id: auth.user.userId,
            name: 'Ada Lovelace',
        },
    }));

export const profile = k.routes({
    getProfile,
});

export default defineConfig({
    adapter: honoAdapter(),
    routes: {
        profile,
    },
    auth: {
        identities: {
            user,
        },
    },
});
`;

export function routesOf(source: string) {
    const start = source.indexOf('const k = new Kizuna();');
    const end = source.indexOf('export default defineConfig');
    return source.slice(source.indexOf('\n', start) + 1, end).trim();
}

export const scenarios: Scenario[] = [
    {
        id: 'users',
        title: 'Typed responses',
        summary: 'A 404 arrives as Problem Details.',
        source: users,
        calls: [
            {
                label: '200',
                typescript: `const result = await client.users.getUser({
    params: {
        id: '1',
    },
});
console.log(result.status, result.body);`,
                swift: `let user = try await client.users.getUser(
    .params(
        id: "1"
    )
)
print(user.body.name)`,
                kotlin: `val user = client.users.getUser {
    params(
        id = "1",
    )
}
println(user.body.name)`,
            },
            {
                label: '404',
                typescript: `const result = await client.users.getUser({
    params: {
        id: '42',
    },
});
console.log(result.status, result.body);`,
                swift: `do {
    let user = try await client.users.getUser(
        .params(
            id: "42"
        )
    )
    print(user.body.name)
} catch .notFound(let problem) {
    print(problem.detail)
}`,
                kotlin: `try {
    val user = client.users.getUser {
        params(
            id = "42",
        )
    }
    println(user.body.name)
} catch (error: APIClient.UsersGetUser.Failure.NotFound) {
    println(error.body.detail)
}`,
            },
        ],
    },
    {
        id: 'validation',
        title: 'Validation',
        summary: 'Bad input gets a 400 naming every field.',
        source: validation,
        calls: [
            {
                label: '201',
                typescript: `const result = await client.users.createUser({
    body: {
        name: 'Grace Hopper',
        email: 'grace@example.com',
    },
});
console.log(result.status, result.body);`,
                swift: `let created = try await client.users.createUser(
    .body(
        name: "Grace Hopper",
        email: "grace@example.com"
    )
)`,
                kotlin: `val created = client.users.createUser {
    body(
        name = "Grace Hopper",
        email = "grace@example.com",
    )
}`,
            },
            {
                label: '400',
                typescript: `const result = await client.users.createUser({
    body: {
        name: '',
        email: 'not-an-email',
    },
});
console.log(result.status, result.body);`,
                swift: `do {
    let created = try await client.users.createUser(
        .body(
            name: "",
            email: "not-an-email"
        )
    )
    print(created.body.id)
} catch .badRequest(let validation) {
    print(validation.errors)
}`,
                kotlin: `try {
    val created = client.users.createUser {
        body(
            name = "",
            email = "not-an-email",
        )
    }
    println(created.body.id)
} catch (error: APIClient.UsersCreateUser.Failure.BadRequest) {
    println(error.body.errors)
}`,
            },
        ],
    },
    {
        id: 'authentication',
        title: 'Authentication',
        summary: 'A missing token gets a 401 with a challenge.',
        source: authentication,
        calls: [
            {
                label: '200',
                scope: {
                    token: 'mF_9.B5f-4.1JqM',
                },
                typescript: `const client = createClient({
    baseUrl: 'http://localhost:3000',
    baseHeaders: {
        Authorization: \`Bearer \${token}\`,
    },
});

const result = await client.profile.getProfile();
console.log(result.status, result.body);`,
                swift: `let client = APIClient(
    baseURL: URL(string: "http://localhost:3000")!,
    requestMiddleware: { request in
        request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")
    }
)

let profile = try await client.profile.getProfile()
print(profile.body.name)`,
                kotlin: `val client = APIClient(
    baseUrl = "http://localhost:3000",
    requestInterceptor = { builder ->
        builder.header("Authorization", "Bearer \$token")
    },
)

val profile = client.profile.getProfile()
println(profile.body.name)`,
            },
            {
                label: '401',
                typescript: `const result = await client.profile.getProfile();
console.log(result.status, result.body);`,
                swift: `do {
    let profile = try await client.profile.getProfile()
    print(profile.body.name)
} catch .unauthorized(let problem) {
    print(problem.detail)
}`,
                kotlin: `try {
    val profile = client.profile.getProfile()
    println(profile.body.name)
} catch (error: APIClient.ProfileGetProfile.Failure.Unauthorized) {
    println(error.body.detail)
}`,
            },
        ],
    },
    {
        id: 'deprecation',
        title: 'Deprecation',
        summary: 'One line sends Deprecation and Sunset headers.',
        source: deprecation,
        calls: [
            {
                label: 'Delete',
                deprecated: {
                    symbol: 'deleteUser',
                    message: "'deleteUser' is deprecated: use archiveUser instead",
                },
                typescript: `const result = await client.users.deleteUser({
    params: {
        id: '1',
    },
});
console.log(result.status);`,
                swift: `try await client.users.deleteUser(
    .params(
        id: "1"
    )
)`,
                kotlin: `client.users.deleteUser {
    params(
        id = "1",
    )
}`,
            },
        ],
    },
    {
        id: 'streaming',
        title: 'Streaming',
        summary: 'Typed events arrive one at a time.',
        source: streaming,
        calls: [
            {
                label: 'Stream',
                typescript: `const result = await client.assistant.reply({
    body: {
        prompt: 'Say something',
    },
});
for await (const message of result.body) {
    console.log(message.event, message.data);
}`,
                swift: `let result = try await client.assistant.reply(
    .body(
        prompt: "Say something"
    )
)
for try await event in result.body {
    switch event {
    case .delta(let delta):
        text += delta.text
    case .done(let done):
        print(done.words)
    }
}`,
                kotlin: `val result = client.assistant.reply {
    body(
        prompt = "Say something",
    )
}
result.body.collect { event ->
    when (event) {
        is APIClient.AssistantReply.Event.Delta -> text.append(event.data.text)
        is APIClient.AssistantReply.Event.Done -> println(event.data.words)
    }
}`,
            },
        ],
    },
];
