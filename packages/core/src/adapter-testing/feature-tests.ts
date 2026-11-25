import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADAPTER_BEHAVIOUR, ADAPTER_FEATURES, featureGroups, featuresInGroup, type AdapterFeature, type AdapterName } from './features.js';
import {
    adminToken,
    badgeBytes,
    brokenInput,
    resetUsers,
    csvBody,
    cachedInput,
    deprecatedInput,
    failingStreamFirstChunk,
    issueInput,
    methodInput,
    ownerToken,
    responseShapeInput,
    securedInput,
    sessionAuthorization,
    sharedSegmentInput,
    signedBodyText,
    nestingInput,
    taskFilterOf,
    TASK_NESTING_LIMIT,
    bodyLimitInput,
    taskBodyOfSize,
    TASK_BODY_LIMIT,
    backgroundInput,
    backgroundWork,
    subUserInput,
    userInput,
    pluginInput,
    streamInput,
    streamGate,
    streamedEventsText,
    streamedTicksText,
    streamedLinesText,
} from './fixtures.js';
import { collectStreamText, readStreamUntil, toMountedApi, type MountedApi, type Transport, type TestResponse } from './transport.js';

/**
 * One adapter, described by its parts. The `never` parameters are what let an api known only at runtime reach a
 * fully typed builder, so those casts stay here instead of in every adapter's test file.
 */
export interface AdapterUnderTest<Api> {
    name: AdapterName;
    /**
     * Assemble a fixture against this adapter. It runs on the adapter's side so
     * the api and its `mount` come from the same copy of core.
     *
     * @example
     * createApi: (input) => defineConfig({ ...input, adapter: expressAdapter() }).api
     */
    createApi: (input: never) => Api;
    mount: (api: Api, options: { responseValidation?: boolean }) => Transport | Promise<Transport>;
}

interface MountOptions {
    /**
     * What a fixture declares, before an adapter is chosen. The catalogue
     * assembles it against the adapter under test.
     */
    input: unknown;
    responseValidation?: boolean;
}

/**
 * An api as `defineConfig` assembles it, which answers requests in process.
 */
interface InProcessApi {
    fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

export const testAdapterFeatures = <Api>(adapter: AdapterUnderTest<Api>): void => {
    const behaviour = ADAPTER_BEHAVIOUR[adapter.name];

    const mount = async (options: MountOptions): Promise<MountedApi> => {
        const api = adapter.createApi(options.input as never);
        const transport = await adapter.mount(api, {
            responseValidation: options.responseValidation,
        });
        return toMountedApi(transport);
    };

    const using = async <T>(options: MountOptions, use: (mounted: MountedApi) => Promise<T>): Promise<T> => {
        const mounted = await mount(options);
        try {
            return await use(mounted);
        } finally {
            await mounted.close?.();
        }
    };

    const usingPlugins = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: pluginInput,
            },
            use
        );

    const usingBodyLimit = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: bodyLimitInput,
            },
            use
        );

    const usingBackground = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: backgroundInput,
            },
            use
        );

    const usingNesting = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: nestingInput,
            },
            use
        );

    const filteredTasks = (tasks: MountedApi, path: string, levels: number) =>
        tasks.request({
            method: 'GET',
            path: `${path}?filter=${encodeURIComponent(taskFilterOf(levels))}`,
        });

    const usingSecured = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: securedInput,
            },
            use
        );

    const usingMethods = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: methodInput,
            },
            use
        );

    const usingDeprecated = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: deprecatedInput,
            },
            use
        );

    const usingStreams = <T>(use: (mounted: MountedApi) => Promise<T>, responseValidation?: boolean) => {
        streamGate.reset();
        return using(
            {
                input: streamInput,
                responseValidation,
            },
            use
        );
    };

    const withTimeout = <T>(promise: Promise<T>, milliseconds: number, what: string): Promise<T> =>
        Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`${what} did not happen within ${milliseconds}ms`)), milliseconds)
            ),
        ]);

    const usingCached = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: cachedInput,
            },
            use
        );

    const usingShapes = <T>(use: (mounted: MountedApi) => Promise<T>) =>
        using(
            {
                input: responseShapeInput,
            },
            use
        );

    const postProfile = (body: unknown) =>
        using(
            {
                input: issueInput,
            },
            (issues) =>
                issues.request({
                    method: 'POST',
                    path: '/profiles',
                    body,
                })
        );

    const issueCodes = (response: TestResponse) =>
        ((response.body as { errors?: Array<{ code: string }> }).errors ?? []).map((issue) => issue.code);

    let api: MountedApi;

    beforeEach(async () => {
        resetUsers();
        api = await mount({
            input: userInput,
        });
    });

    afterEach(async () => {
        await api.close?.();
    });

    const createAda = () =>
        api.request({
            method: 'POST',
            path: '/users',
            body: {
                name: 'Ada',
                email: 'ada@example.com',
            },
        });

    const tests: Record<AdapterFeature, () => Promise<void>> = {
        'routing.pathParams': async () => {
            await createAda();
            const response = await api.request({
                method: 'GET',
                path: '/users/1',
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                id: '1',
                name: 'Ada',
            });
        },

        'routing.methodDispatch': async () => {
            await createAda();
            const deleted = await api.request({
                method: 'DELETE',
                path: '/users/1',
            });
            expect(deleted.status).toBe(200);
            expect(deleted.body).toEqual({
                success: true,
            });

            const response = await api.request({
                method: 'GET',
                path: '/users/1',
            });
            expect(response.status).toBe(404);
        },

        'routing.methodMismatch': async () => {
            const response = await api.request({
                method: 'PUT',
                path: '/users/1',
                body: {
                    name: 'Ada',
                },
            });
            expect(response.status).toBe(behaviour.methodMismatchStatus);
        },

        'routing.notFound': async () => {
            const response = await api.request({
                method: 'GET',
                path: '/not-a-declared-route',
            });
            expect(response.status).toBe(404);
        },

        'routing.sharedSegmentParams': async () => {
            const cases = {
                '/range/a-b-c': {
                    from: 'a-b',
                    to: 'c',
                },
                '/range/2024-01-2024-02': {
                    from: '2024-01-2024',
                    to: '02',
                },
                '/range/a%2Db-c': {
                    from: 'a-b',
                    to: 'c',
                },
                '/files/archive.tar.gz': {
                    name: 'archive.tar',
                    ext: 'gz',
                },
                '/span/a-to-b-to-c': {
                    start: 'a-to-b',
                    end: 'c',
                },
            };
            await using(
                {
                    input: sharedSegmentInput,
                },
                async (shared) => {
                    for (const [path, params] of Object.entries(cases)) {
                        const response = await shared.request({
                            method: 'GET',
                            path,
                        });
                        expect(response.status, path).toBe(200);
                        expect(response.body, path).toEqual(params);
                    }
                }
            );
        },

        'routing.sharedSegmentMismatch': async () => {
            await using(
                {
                    input: sharedSegmentInput,
                },
                async (shared) => {
                    for (const path of ['/range/a-b-', '/range/-a', '/files/archive.']) {
                        const response = await shared.request({
                            method: 'GET',
                            path,
                        });
                        expect(response.status, path).toBe(404);
                    }
                }
            );
        },

        'routing.malformedEscape': async () => {
            const plain = await api.request({
                method: 'GET',
                path: '/users/%E0',
            });
            expect(plain.status).toBe(400);
            await using(
                {
                    input: sharedSegmentInput,
                },
                async (shared) => {
                    const response = await shared.request({
                        method: 'GET',
                        path: '/range/%E0-b',
                    });
                    expect(response.status).toBe(400);
                }
            );
        },

        'routing.subRouterComposition': async () => {
            await using(
                {
                    input: subUserInput,
                },
                async (composed) => {
                    const response = await composed.request({
                        method: 'GET',
                        path: '/sub-users/42',
                    });
                    expect(response.status).toBe(200);
                    expect(response.body).toEqual({
                        id: '42',
                    });
                }
            );
        },

        'routing.allMethods': async () => {
            await usingMethods(async (methods) => {
                for (const [method, path] of [
                    ['GET', '/items/1'],
                    ['POST', '/items'],
                    ['PUT', '/items/1'],
                    ['PATCH', '/items/1'],
                    ['DELETE', '/items/1'],
                    ['OPTIONS', '/items/1'],
                ] as const) {
                    const response = await methods.request({
                        method,
                        path,
                    });
                    expect(response.status, `${method} ${path}`).toBe(200);
                    expect(response.body, `${method} ${path}`).toEqual({
                        method,
                    });
                }
            });
        },

        'routing.headStripsBody': async () => {
            await usingMethods(async (methods) => {
                const response = await methods.request({
                    method: 'HEAD',
                    path: '/items/1',
                });
                expect(response.status).toBe(200);
                expect(response.text).toBe('');
            });
        },

        'routing.headViaGet': async () => {
            await usingMethods(async (methods) => {
                const get = await methods.request({
                    method: 'GET',
                    path: '/items',
                });
                const head = await methods.request({
                    method: 'HEAD',
                    path: '/items',
                });
                // RFC 9110 §9.3.2: same status and headers as GET, no content.
                expect(head.status).toBe(200);
                expect(head.text).toBe('');
                expect(head.headers.get('content-type')).toContain('application/json');
                expect(head.headers.get('content-length')).toBe(String(new TextEncoder().encode(get.text).length));
            });
        },

        'routing.headInAllow': async () => {
            await usingMethods(async (methods) => {
                const options = await methods.request({
                    method: 'OPTIONS',
                    path: '/items',
                });
                expect(options.status).toBe(200);
                const allow = options.headers.get('allow') ?? '';
                expect(allow, `Allow: ${allow}`).toContain('GET');
                expect(allow, `Allow: ${allow}`).toContain('HEAD');

                if (behaviour.methodMismatchStatus === 405) {
                    const mismatch = await methods.request({
                        method: 'PATCH',
                        path: '/items',
                    });
                    expect(mismatch.status).toBe(405);
                    expect(mismatch.headers.get('allow') ?? '').toContain('HEAD');
                }
            });
        },

        'routing.optionsAllow': async () => {
            await usingMethods(async (methods) => {
                const response = await methods.request({
                    method: 'OPTIONS',
                    path: '/items/1',
                });
                expect(response.status).toBe(200);
                const allow = response.headers.get('allow') ?? '';
                for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
                    expect(allow, `Allow: ${allow}`).toContain(method);
                }
            });
        },

        'query.defaults': async () => {
            const response = await api.request({
                method: 'GET',
                path: '/users',
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                users: [],
                total: 0,
            });
        },

        'query.coercion': async () => {
            await createAda();
            await api.request({
                method: 'POST',
                path: '/users',
                body: {
                    name: 'Grace',
                    email: 'grace@example.com',
                },
            });
            const response = await api.request({
                method: 'GET',
                path: '/users?page=2&limit=1',
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                users: [
                    {
                        id: '2',
                        name: 'Grace',
                    },
                ],
                total: 2,
            });
        },

        'query.singleValueArray': async () => {
            await createAda();
            await api.request({
                method: 'POST',
                path: '/users',
                body: {
                    name: 'Grace',
                    email: 'grace@example.com',
                },
            });
            const response = await api.request({
                method: 'GET',
                path: '/users?ids=2',
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                users: [
                    {
                        id: '2',
                        name: 'Grace',
                    },
                ],
                total: 1,
            });
        },

        'query.methodOverride': async () => {
            await createAda();
            await api.request({
                method: 'POST',
                path: '/users',
                body: {
                    name: 'Grace',
                    email: 'grace@example.com',
                },
            });
            const overridden = await api.request({
                method: 'POST',
                path: '/users',
                body: 'ids=1&ids=2&limit=1',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'x-http-method-override': 'GET',
                },
            });
            expect(overridden.status).toBe(200);
            expect(overridden.body).toEqual({
                users: [
                    {
                        id: '1',
                        name: 'Ada',
                    },
                ],
                total: 2,
            });
            const created = await api.request({
                method: 'POST',
                path: '/users',
                body: {
                    name: 'Linus',
                    email: 'linus@example.com',
                },
            });
            expect(created.status).toBe(201);
        },
        'query.jsonObject': async () => {
            await createAda();
            await api.request({
                method: 'POST',
                path: '/users',
                body: {
                    name: 'Grace',
                    email: 'grace@example.com',
                },
            });
            const filter = encodeURIComponent(
                JSON.stringify({
                    name: 'Grace',
                })
            );
            const response = await api.request({
                method: 'GET',
                path: `/users?filter=${filter}`,
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                users: [
                    {
                        id: '2',
                        name: 'Grace',
                    },
                ],
                total: 1,
            });
            const invalid = await api.request({
                method: 'GET',
                path: '/users?filter=Grace',
            });
            expect(invalid.status).toBe(400);
        },

        'query.repeatedKeys': async () => {
            await createAda();
            await api.request({
                method: 'POST',
                path: '/users',
                body: {
                    name: 'Grace',
                    email: 'grace@example.com',
                },
            });
            const response = await api.request({
                method: 'GET',
                path: '/users?ids=1&ids=2',
            });
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                users: [
                    {
                        id: '1',
                        name: 'Ada',
                    },
                    {
                        id: '2',
                        name: 'Grace',
                    },
                ],
                total: 2,
            });
        },

        'body.json': async () => {
            const response = await createAda();
            expect(response.status).toBe(201);
            expect(response.body).toEqual({
                id: '1',
                name: 'Ada',
                email: 'ada@example.com',
            });
        },

        'body.invalid400': async () => {
            const response = await api.request({
                method: 'POST',
                path: '/users',
                body: {
                    name: '',
                    email: 'not-an-email',
                },
            });
            expect(response.status).toBe(400);
        },

        'body.optionalFields': async () => {
            const required = {
                name: 'Ada',
                age: 36,
                tags: ['a'],
                slug: 'ada',
            };

            const withoutOptional = await postProfile(required);
            expect(withoutOptional.status).toBe(201);

            const withOptional = await postProfile({
                ...required,
                nickname: 'Addy',
            });
            expect(withOptional.status).toBe(201);

            const wrongType = await postProfile({
                ...required,
                nickname: 123,
            });
            expect(wrongType.status).toBe(400);
        },

        'body.rawBody': async () => {
            const response = await usingShapes((shapes) =>
                shapes.request({
                    method: 'POST',
                    path: '/signed',
                    body: signedBodyText,
                })
            );
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                rawBody: signedBodyText,
                name: 'Ada',
            });
        },

        'body.limit413': async () => {
            await usingBodyLimit(async (tasks) => {
                const atLimit = await tasks.request({
                    method: 'POST',
                    path: '/tasks',
                    body: taskBodyOfSize(TASK_BODY_LIMIT),
                });
                expect(atLimit.status).toBe(201);

                const overLimit = await tasks.request({
                    method: 'POST',
                    path: '/tasks',
                    body: taskBodyOfSize(TASK_BODY_LIMIT + 1),
                });
                expect(overLimit.status).toBe(413);
                expect(overLimit.headers.get('connection')).toBe('close');
                expect(overLimit.headers.get('content-type')).toContain('application/problem+json');
                expect(overLimit.body).toMatchObject({
                    status: 413,
                    detail: `The request body is larger than ${TASK_BODY_LIMIT} bytes.`,
                });
            });
        },

        'body.limitChunked': async () => {
            await usingBodyLimit(async (tasks) => {
                const atLimit = await tasks.request({
                    method: 'POST',
                    path: '/tasks',
                    body: taskBodyOfSize(TASK_BODY_LIMIT),
                    chunked: true,
                });
                expect(atLimit.status).toBe(201);

                const overLimit = await tasks.request({
                    method: 'POST',
                    path: '/tasks',
                    body: taskBodyOfSize(TASK_BODY_LIMIT + 1),
                    chunked: true,
                });
                expect(overLimit.status).toBe(413);
            });
        },

        'body.limitPerRoute': async () => {
            await usingBodyLimit(async (tasks) => {
                const body = taskBodyOfSize(TASK_BODY_LIMIT * 2);
                const raised = await tasks.request({
                    method: 'POST',
                    path: '/tasks/import',
                    body,
                });
                expect(raised.status).toBe(201);

                const refused = await tasks.request({
                    method: 'POST',
                    path: '/tasks',
                    body,
                });
                expect(refused.status).toBe(413);
            });
        },

        'body.limitRawBody': async () => {
            await usingBodyLimit(async (tasks) => {
                const atLimit = await tasks.request({
                    method: 'POST',
                    path: '/tasks/signed',
                    body: taskBodyOfSize(TASK_BODY_LIMIT),
                });
                expect(atLimit.status).toBe(201);

                const overLimit = await tasks.request({
                    method: 'POST',
                    path: '/tasks/signed',
                    body: taskBodyOfSize(TASK_BODY_LIMIT + 1),
                    chunked: true,
                });
                expect(overLimit.status).toBe(413);
            });
        },

        'body.nesting400': async () => {
            await usingNesting(async (tasks) => {
                const atLimit = await tasks.request({
                    method: 'POST',
                    path: '/task-filters',
                    body: taskFilterOf(TASK_NESTING_LIMIT),
                });
                expect(atLimit.status).toBe(201);

                const overLimit = await tasks.request({
                    method: 'POST',
                    path: '/task-filters',
                    body: taskFilterOf(TASK_NESTING_LIMIT + 1),
                });
                expect(overLimit.status).toBe(400);
                expect(overLimit.headers.get('content-type')).toContain('application/problem+json');
                expect(overLimit.body).toMatchObject({
                    status: 400,
                    errors: [
                        {
                            code: 'too_big',
                            path: [],
                            message: `Nests deeper than ${TASK_NESTING_LIMIT} levels.`,
                        },
                    ],
                });
            });
        },

        'body.deepNesting400': async () => {
            await usingNesting(async (tasks) => {
                const response = await tasks.request({
                    method: 'POST',
                    path: '/task-filters',
                    body: taskFilterOf(10_001),
                });
                expect(response.status).toBe(400);
            });
        },

        'query.nesting400': async () => {
            await usingNesting(async (tasks) => {
                expect((await filteredTasks(tasks, '/filtered-tasks', TASK_NESTING_LIMIT)).status).toBe(200);

                const overLimit = await filteredTasks(tasks, '/filtered-tasks', TASK_NESTING_LIMIT + 1);
                expect(overLimit.status).toBe(400);
                expect(overLimit.body).toMatchObject({
                    status: 400,
                    errors: [
                        {
                            code: 'too_big',
                            path: ['filter'],
                            message: `Nests deeper than ${TASK_NESTING_LIMIT} levels.`,
                        },
                    ],
                });
            });
        },

        'query.deepNesting400': async () => {
            await usingNesting(async (tasks) => {
                const response = await filteredTasks(tasks, '/deeply-filtered-tasks', 1_201);
                expect(response.status).toBe(400);
            });
        },

        'query.nestingPerRoute': async () => {
            await usingNesting(async (tasks) => {
                const levels = TASK_NESTING_LIMIT + 2;
                expect((await filteredTasks(tasks, '/deeply-filtered-tasks', levels)).status).toBe(200);
                expect((await filteredTasks(tasks, '/filtered-tasks', levels)).status).toBe(400);
            });
        },

        'body.compressed415': async () => {
            await usingBodyLimit(async (tasks) => {
                const response = await tasks.request({
                    method: 'POST',
                    path: '/tasks',
                    body: taskBodyOfSize(TASK_BODY_LIMIT),
                    headers: {
                        'content-encoding': 'gzip',
                    },
                });
                expect(response.status).toBe(415);
                expect(response.headers.get('accept-encoding')).toBe('identity');
                expect(response.headers.get('content-type')).toContain('application/problem+json');
            });
        },

        'handler.waitUntil': async () => {
            await usingBackground(async (tasks) => {
                backgroundWork.hold();
                const response = await tasks.request({
                    method: 'POST',
                    path: '/tasks/reminders',
                });
                expect(response.status).toBe(202);
                expect(backgroundWork.isFinished).toBe(false);

                backgroundWork.release();
                await backgroundWork.finished;
                expect(backgroundWork.isFinished).toBe(true);
            });
        },

        'handler.waitUntilFailure': async () => {
            const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                await usingBackground(async (tasks) => {
                    const response = await tasks.request({
                        method: 'POST',
                        path: '/tasks/failing-reminders',
                    });
                    expect(response.status).toBe(202);
                    await vi.waitFor(() => {
                        expect(logged).toHaveBeenCalledWith(
                            '[kizuna] failReminder: the work passed to `waitUntil` failed.',
                            expect.objectContaining({
                                message: 'The mail service is down.',
                            })
                        );
                    });
                });
            } finally {
                logged.mockRestore();
            }
        },

        'errors.declaredProblemDetails': async () => {
            const response = await api.request({
                method: 'GET',
                path: '/users/missing',
            });
            expect(response.status).toBe(404);
            expect(response.headers.get('content-type')).toContain('application/problem+json');
            expect(response.body).toMatchObject({
                status: 404,
                detail: 'Not found',
            });
        },

        'errors.unsupportedMediaType415': async () => {
            const response = await api.request({
                method: 'POST',
                path: '/users',
                body: '<user />',
                headers: {
                    'content-type': 'application/xml',
                },
            });
            expect(response.status).toBe(415);
        },

        'errors.notAcceptable406': async () => {
            const response = await api.request({
                method: 'GET',
                path: '/users',
                headers: {
                    accept: 'text/html',
                },
            });
            expect(response.status).toBe(406);
        },

        'errors.validationProblemDetails': async () => {
            await usingShapes(async (shapes) => {
                const response = await shapes.request({
                    method: 'POST',
                    path: '/validated',
                    body: {
                        name: '',
                    },
                });
                expect(response.status).toBe(400);
                expect(response.headers.get('content-type')).toContain('application/problem+json');
                const problem = response.body as { detail?: string; errors?: unknown };
                expect(problem.detail).toBeDefined();
                expect(Array.isArray(problem.errors)).toBe(true);
            });
        },

        'errors.validationIssueCodes': async () => {
            const valid = {
                name: 'Ada',
                age: 36,
                tags: ['a'],
                slug: 'ada',
            };

            const missing = await postProfile({
                age: 36,
                tags: [],
                slug: 'ada',
            });
            expect(missing.status).toBe(400);
            expect(issueCodes(missing)).toContain('invalid_type');

            const tooSmall = await postProfile({
                ...valid,
                name: '',
            });
            expect(issueCodes(tooSmall)).toContain('too_small');

            const tooBig = await postProfile({
                ...valid,
                age: 999,
            });
            expect(issueCodes(tooBig)).toContain('too_big');

            const tooManyTags = await postProfile({
                ...valid,
                tags: ['a', 'b', 'c'],
            });
            expect(issueCodes(tooManyTags)).toContain('too_big');

            const fieldRefine = await postProfile({
                ...valid,
                slug: 'has space',
            });
            expect(issueCodes(fieldRefine)).toContain('custom');

            const topLevelRefine = await postProfile({
                ...valid,
                name: 'same',
                slug: 'same',
            });
            expect(issueCodes(topLevelRefine)).toContain('custom');

            const shape = await postProfile({
                ...valid,
                name: '',
            });
            for (const issue of (shape.body as { errors: Array<Record<string, unknown>> }).errors) {
                expect(Object.keys(issue).sort()).toEqual(['code', 'message', 'path']);
            }
        },

        'guards.publicRoute': async () => {
            await usingSecured(async (secured) => {
                const response = await secured.request({
                    method: 'GET',
                    path: '/public',
                });
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    ok: true,
                });
            });
        },

        'guards.denied': async () => {
            await usingSecured(async (secured) => {
                const response = await secured.request({
                    method: 'GET',
                    path: '/who-am-i',
                });
                expect(response.status).toBe(401);
            });
        },

        'guards.context': async () => {
            await usingSecured(async (secured) => {
                const response = await secured.request({
                    method: 'GET',
                    path: '/who-am-i',
                    headers: {
                        authorization: sessionAuthorization,
                    },
                });
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    userId: '1',
                });
            });
        },

        'guards.requires': async () => {
            await usingSecured(async (secured) => {
                const rejected = await secured.request({
                    method: 'GET',
                    path: '/owner-only',
                    headers: {
                        'x-workspace-token': adminToken,
                    },
                });
                expect(rejected.status).toBe(403);

                const allowed = await secured.request({
                    method: 'GET',
                    path: '/owner-only',
                    headers: {
                        'x-workspace-token': ownerToken,
                    },
                });
                expect(allowed.status).toBe(200);
            });
        },

        'guards.roles': async () => {
            await usingSecured(async (secured) => {
                const rejected = await secured.request({
                    method: 'GET',
                    path: '/admin-only',
                    headers: {
                        'x-workspace-token': ownerToken,
                    },
                });
                expect(rejected.status).toBe(403);

                const allowed = await secured.request({
                    method: 'GET',
                    path: '/admin-only',
                    headers: {
                        'x-workspace-token': adminToken,
                    },
                });
                expect(allowed.status).toBe(200);
            });
        },

        'guards.multiIdentity': async () => {
            await usingSecured(async (secured) => {
                const partial = await secured.request({
                    method: 'GET',
                    path: '/both',
                    headers: {
                        authorization: sessionAuthorization,
                    },
                });
                expect(partial.status).toBe(403);

                const complete = await secured.request({
                    method: 'GET',
                    path: '/both',
                    headers: {
                        authorization: sessionAuthorization,
                        'x-workspace-token': ownerToken,
                    },
                });
                expect(complete.status).toBe(200);
                expect(complete.body).toEqual({
                    userId: '1',
                    workspaceUserId: '1',
                });
            });
        },

        'guards.authFailureModes': async () => {
            await usingSecured(async (secured) => {
                const unresolved = await secured.request({
                    method: 'GET',
                    path: '/who-am-i',
                });
                expect(unresolved.status).toBe(401);
                // RFC 9110 section 11.6.1: a 401 names the scheme the client should use.
                expect(unresolved.headers.get('www-authenticate')).toBe('Bearer');

                const gated = await secured.request({
                    method: 'GET',
                    path: '/owner-only',
                    headers: {
                        'x-workspace-token': adminToken,
                    },
                });
                expect(gated.status).toBe(403);
                // A resolved identity needs no challenge; the credential was fine.
                expect(gated.headers.get('www-authenticate')).toBeNull();
            });
        },

        'responses.declaredContentType': async () => {
            await usingShapes(async (shapes) => {
                const response = await shapes.request({
                    method: 'GET',
                    path: '/items.csv',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toContain('text/csv');
                expect(response.text).toBe(csvBody);
            });
        },

        'responses.binary': async () => {
            await usingShapes(async (shapes) => {
                const response = await shapes.request({
                    method: 'GET',
                    path: '/badge',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toContain('application/octet-stream');
                expect(response.text.length).toBe(badgeBytes.length);
            });
        },

        'responses.void': async () => {
            await usingShapes(async (shapes) => {
                const response = await shapes.request({
                    method: 'DELETE',
                    path: '/items/1',
                });
                expect(response.status).toBe(204);
                expect(response.headers.get('content-type')).toBeNull();
                expect(response.text).toBe('');
            });
        },

        'responses.validation': async () => {
            await using(
                {
                    input: brokenInput,
                    responseValidation: true,
                },
                async (broken) => {
                    const response = await broken.request({
                        method: 'GET',
                        path: '/broken',
                    });
                    expect(response.status).toBe(500);
                }
            );
        },
        'deprecation.deprecationHeader': async () => {
            await usingDeprecated(async (mounted) => {
                const response = await mounted.request({
                    method: 'DELETE',
                    path: '/deprecated-users/1',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('deprecation')).toBe('@1772323200');
                expect(response.headers.get('link')).toBe('<https://example.com/changelog/delete-user>; rel="deprecation"');
            });
        },
        'deprecation.sunsetHeader': async () => {
            await usingDeprecated(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/report',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('sunset')).toBe('Fri, 01 Jan 2027 00:00:00 GMT');
                expect(response.headers.get('link')).toBe('<https://example.com/retirement-policy>; rel="sunset"');
            });
        },
        'deprecation.errorResponses': async () => {
            await usingDeprecated(async (mounted) => {
                const response = await mounted.request({
                    method: 'DELETE',
                    path: '/deprecated-users/404',
                });
                expect(response.status).toBe(404);
                expect(response.headers.get('deprecation')).toBe('@1772323200');
                expect(response.headers.get('link')).toBe('<https://example.com/changelog/delete-user>; rel="deprecation"');
            });
        },
        'cache.cacheControlHeader': async () => {
            await usingCached(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/cached-users',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('cache-control')).toBe('private, max-age=300');
            });
        },
        'cache.varyHeader': async () => {
            await usingCached(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/cached-users',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('vary')).toBe('authorization');
            });
        },
        'cache.undeclaredStatus': async () => {
            await usingCached(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/cached-lookup/404',
                });
                expect(response.status).toBe(404);
                expect(response.headers.get('cache-control')).toBeNull();
            });
        },
        'cache.errorResponseCache': async () => {
            await usingCached(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/cached-users/404',
                });
                expect(response.status).toBe(404);
                expect(response.headers.get('cache-control')).toBe('public, max-age=10');
            });
        },
        'cache.declarationWins': async () => {
            await usingCached(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/cached-report',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('cache-control')).toBe('private, max-age=300');
            });
        },
        'cache.frameworkRaisedStatus': async () => {
            await usingCached(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/cached-validated?page=not-a-number',
                });
                expect(response.status).toBe(400);
                expect(response.headers.get('cache-control')).toBe('no-store');
            });
            await usingSecured(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/who-am-i',
                });
                expect(response.status).toBe(401);
                expect(response.headers.get('cache-control')).toBe('no-store');
            });
        },
        'cache.etagHeader': async () => {
            await usingCached(async (mounted) => {
                const first = await mounted.request({
                    method: 'GET',
                    path: '/tagged-users/1',
                });
                expect(first.status).toBe(200);
                expect(first.headers.get('etag')).toMatch(/^"[0-9a-f]{32}"$/);

                const second = await mounted.request({
                    method: 'GET',
                    path: '/tagged-users/1',
                });
                expect(second.headers.get('etag')).toBe(first.headers.get('etag'));

                const other = await mounted.request({
                    method: 'GET',
                    path: '/tagged-users/2',
                });
                expect(other.headers.get('etag')).not.toBe(first.headers.get('etag'));
            });
        },
        'cache.etagNotModified': async () => {
            await usingCached(async (mounted) => {
                const first = await mounted.request({
                    method: 'GET',
                    path: '/tagged-users/1',
                });
                const etag = first.headers.get('etag');
                expect(etag).not.toBeNull();

                const second = await mounted.request({
                    method: 'GET',
                    path: '/tagged-users/1',
                    headers: {
                        'if-none-match': etag as string,
                    },
                });
                expect(second.status).toBe(304);
                expect(second.text).toBe('');
                expect(second.headers.get('etag')).toBe(etag);
                expect(second.headers.get('cache-control')).toBe('private, no-cache');
            });
        },
        'cache.etagMismatchSendsBody': async () => {
            await usingCached(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/tagged-users/1',
                    headers: {
                        'if-none-match': '"stale-tag-value"',
                    },
                });
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    id: '1',
                });
            });
        },
        'plugins.routesServed': async () => {
            await usingPlugins(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/probe/ping',
                });
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    pong: true,
                });
            });
        },
        'plugins.exportsReachHandlers': async () => {
            await usingPlugins(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/which-label',
                });
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    label: 'probed',
                });
            });
        },
        'plugins.contractWinsOverlap': async () => {
            await usingPlugins(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/which-label/me',
                });
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    from: 'contract',
                });
            });
        },
        'plugins.rawResponse': async () => {
            await usingPlugins(async (mounted) => {
                const response = await mounted.request({
                    method: 'GET',
                    path: '/probe/stream',
                });
                expect(response.status).toBe(200);
                expect(response.text).toBe('not json at all');
            });
        },
        'plugins.rawResponseStreamError': async () => {
            await usingPlugins(async (mounted) => {
                const response = await mounted.stream({
                    method: 'GET',
                    path: '/probe/failing-stream',
                });
                expect(response.status).toBe(200);
                const { text, error } = await withTimeout(collectStreamText(response.body), 2000, 'the cut-short read');
                expect(text).toBe(failingStreamFirstChunk);
                expect(error).toBeDefined();
                const next = await mounted.request({
                    method: 'GET',
                    path: '/probe/ping',
                });
                expect(next.status).toBe(200);
            });
        },
        'streams.sseFraming': async () => {
            await usingStreams(async (streams) => {
                const response = await streams.request({
                    method: 'GET',
                    path: '/events',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toContain('text/event-stream');
                expect(response.headers.get('cache-control')).toBe('no-store');
                expect(response.text).toBe(streamedEventsText);
            });
        },
        'streams.lastEventId': async () => {
            await usingStreams(async (streams) => {
                const resumed = await streams.request({
                    method: 'GET',
                    path: '/notifications',
                    headers: {
                        'last-event-id': '1',
                    },
                });
                expect(resumed.text).toBe('data: {"title":"New comment"}\nid: 2\n\ndata: {"title":"Report ready"}\nid: 3\n\n');
                const fresh = await streams.request({
                    method: 'GET',
                    path: '/notifications',
                });
                expect(fresh.text).toContain('id: 1\n');
            });
        },
        'streams.unnamedData': async () => {
            await usingStreams(async (streams) => {
                const response = await streams.request({
                    method: 'GET',
                    path: '/ticks',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toContain('text/event-stream');
                expect(response.text).toBe(streamedTicksText);
            });
        },
        'streams.incrementalDelivery': async () => {
            await usingStreams(async (streams) => {
                streamGate.hold();
                const response = await streams.stream({
                    method: 'GET',
                    path: '/events',
                });
                expect(response.status).toBe(200);
                const reader = response.body.getReader();
                const first = await withTimeout(
                    readStreamUntil(reader, (text) => text.includes(': keep-alive')),
                    2000,
                    'the first message'
                );
                expect(first).toContain('event: delta');
                expect(first).not.toContain('event: done');
                streamGate.release();
                const rest = await readStreamUntil(reader, (text) => text.includes('event: done'));
                expect(first + rest).toBe(streamedEventsText);
            });
        },
        'streams.clientDisconnectSignal': async () => {
            await usingStreams(async (streams) => {
                streamGate.hold();
                const response = await streams.stream({
                    method: 'GET',
                    path: '/events',
                });
                const reader = response.body.getReader();
                await readStreamUntil(reader, (text) => text.includes(': keep-alive'));
                response.abort();
                await withTimeout(streamGate.aborted, 2000, 'the abort signal');
                streamGate.release();
            });
        },
        'streams.rawChunks': async () => {
            await usingStreams(async (streams) => {
                const response = await streams.request({
                    method: 'GET',
                    path: '/lines.txt',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toContain('text/plain');
                expect(response.headers.get('cache-control')).toBe('no-store');
                expect(response.text).toBe(streamedLinesText);
            });
        },
        'streams.headNoBody': async () => {
            await usingStreams(async (streams) => {
                const response = await streams.request({
                    method: 'HEAD',
                    path: '/events',
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toContain('text/event-stream');
                expect(response.text).toBe('');
            });
        },
        'streams.errorStatusBuffered': async () => {
            await usingStreams(async (streams) => {
                const response = await streams.request({
                    method: 'GET',
                    path: '/events?fail=1',
                });
                expect(response.status).toBe(400);
                expect(response.headers.get('content-type')).toContain('application/problem+json');
                expect(response.body).toMatchObject({
                    status: 400,
                    detail: 'asked to fail',
                });
            });
        },
        'streams.midStreamErrorTruncates': async () => {
            await usingStreams(async (streams) => {
                const response = await streams.stream({
                    method: 'GET',
                    path: '/events?boom=1',
                });
                expect(response.status).toBe(200);
                const { text, error } = await withTimeout(collectStreamText(response.body), 2000, 'the truncated read');
                expect(text).toContain('event: delta');
                expect(error).toBeDefined();
            });
        },
        'streams.toolsRunAsCaller': async () => {
            await usingSecured(async (secured) => {
                const signedIn = await secured.request({
                    method: 'GET',
                    path: '/profile-reply',
                    headers: {
                        authorization: sessionAuthorization,
                    },
                });
                expect(signedIn.status).toBe(200);
                expect(signedIn.text).toBe(
                    'event: tool_call\ndata: {"id":"call_1","name":"readProfile"}\n\n' +
                        'event: tool_result\ndata: {"id":"call_1","name":"readProfile","output":{"userId":"1"}}\n\n' +
                        'event: done\ndata: {"ok":true}\n\n'
                );

                const anonymous = await secured.request({
                    method: 'GET',
                    path: '/profile-reply',
                });
                expect(anonymous.status).toBe(200);
                expect(anonymous.text).toBe(
                    'event: tool_call\ndata: {"id":"call_1","name":"readProfile"}\n\n' +
                        'event: tool_error\ndata: {"id":"call_1","name":"readProfile","message":"Unauthorized"}\n\n' +
                        'event: done\ndata: {"ok":false}\n\n'
                );
            });
        },
        'streams.itemValidation': async () => {
            await usingStreams(async (streams) => {
                const response = await streams.stream({
                    method: 'GET',
                    path: '/events?invalid=1',
                });
                expect(response.status).toBe(200);
                const { text, error } = await withTimeout(collectStreamText(response.body), 2000, 'the truncated read');
                expect(text).toContain('data: {"text":"a"}');
                expect(text).not.toContain('42');
                expect(error).toBeDefined();
            }, true);
        },

        'inProcess.answers': async () => {
            const inProcess = adapter.createApi(userInput as never) as InProcessApi;
            const created = await inProcess.fetch('/users', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    name: 'Ada',
                    email: 'ada@example.com',
                }),
            });
            expect(created.status).toBe(201);
            expect(await created.json()).toMatchObject({
                name: 'Ada',
                email: 'ada@example.com',
            });
            const invalid = await inProcess.fetch('/users', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    name: '',
                    email: 'not-an-email',
                }),
            });
            expect(invalid.status).toBe(400);
            expect((await inProcess.fetch('/nowhere')).status).toBe(404);
        },

        'inProcess.guards': async () => {
            const inProcess = adapter.createApi(securedInput as never) as InProcessApi;
            expect((await inProcess.fetch('/who-am-i')).status).toBe(401);
            const allowed = await inProcess.fetch('/who-am-i', {
                headers: {
                    authorization: sessionAuthorization,
                },
            });
            expect(allowed.status).toBe(200);
            expect(await allowed.json()).toEqual({
                userId: '1',
            });
        },

        'inProcess.besideTransport': async () => {
            const inProcess = adapter.createApi(userInput as never) as InProcessApi;
            expect((await inProcess.fetch('/nowhere')).status).toBe(404);
            await using(
                {
                    input: userInput,
                },
                async (mounted) => {
                    for (let index = 0; index < 3; index++) {
                        const response = await mounted.request({
                            method: 'GET',
                            path: '/users',
                        });
                        expect(response.status).toBe(200);
                    }
                }
            );
        },

        'inProcess.streams': async () => {
            const inProcess = adapter.createApi(streamInput as never) as InProcessApi;
            streamGate.hold();
            const response = await inProcess.fetch('/events');
            expect(response.status).toBe(200);
            const reader = response.body!.getReader();
            const first = await withTimeout(
                readStreamUntil(reader, (text) => text.includes(': keep-alive')),
                2000,
                'the first message'
            );
            expect(first).toContain('event: delta');
            expect(first).not.toContain('event: done');
            streamGate.release();
            const rest = await readStreamUntil(reader, (text) => text.includes('event: done'));
            expect(first + rest).toBe(streamedEventsText);
        },
    };

    describe(adapter.name, () => {
        for (const group of featureGroups()) {
            describe(group, () => {
                for (const name of featuresInGroup(group)) {
                    it(`${name}: ${ADAPTER_FEATURES[name].summary}`, tests[name]);
                }
            });
        }

        it('covers every adapter feature', () => {
            expect(Object.keys(tests).sort()).toEqual(Object.keys(ADAPTER_FEATURES).sort());
        });
    });
};
