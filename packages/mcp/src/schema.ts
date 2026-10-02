import { z } from 'zod';
import {
    isJsonMediaType,
    isStreamResponse,
    isSuccessStatus,
    isVoidSchema,
    resolveResponseBody,
    resolveResponseContentType,
} from 'kizunajs/generator';
import type { RouteDefinition } from 'kizunajs';
import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';

/**
 * A tool schema as the SDK takes it. Zod still validates, and the JSON Schema
 * the client receives drops the `id` a `Kizuna.model` carries: validators
 * read a bare `id` as the draft-04 spelling of `$id` and refuse the tool.
 */
export const toolSchema = <Schema extends z.ZodType>(schema: Schema): StandardSchemaWithJSON<z.input<Schema>, z.output<Schema>> => {
    const convert = (io: 'input' | 'output'): Record<string, unknown> =>
        z.toJSONSchema(schema, {
            target: 'draft-2020-12',
            io,
            override: ({ jsonSchema }) => {
                delete jsonSchema.id;
            },
        }) as Record<string, unknown>;
    return {
        '~standard': {
            ...schema['~standard'],
            jsonSchema: {
                input: () => convert('input'),
                output: () => convert('output'),
            },
        },
    };
};

/**
 * The `{ status, body }` envelope a tool returns, with `body` carrying the
 * route's JSON success bodies. A route with none gets `status` alone.
 */
export const buildToolOutputSchema = (route: RouteDefinition): z.ZodType => {
    const bodies: z.ZodType[] = [];
    let someSuccessHasNoBody = false;

    for (const status of Object.keys(route.responses)
        .map(Number)
        .sort((left, right) => left - right)) {
        if (!isSuccessStatus(status)) continue;
        const response = route.responses[status];
        if (response === undefined) continue;
        const contentType = resolveResponseContentType(response);
        if (isStreamResponse(response) || (contentType !== undefined && !isJsonMediaType(contentType))) {
            someSuccessHasNoBody = true;
            continue;
        }
        const body = resolveResponseBody(response)!;
        if (isVoidSchema(body)) {
            someSuccessHasNoBody = true;
            continue;
        }
        bodies.push(body);
    }

    const status = z.int().describe('The HTTP status the route answered with');

    if (bodies.length === 0) {
        return z.object({
            status,
        });
    }

    const body = bodies.length === 1 ? bodies[0]! : z.union(bodies);

    return z.object({
        status,
        body: someSuccessHasNoBody ? body.optional() : body,
    });
};
