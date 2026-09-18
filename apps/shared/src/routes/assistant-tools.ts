import { z } from 'zod';
import { countWords, forecastFor, signupsOverDays } from '../assistant';
import { k } from '../k';

const TemperatureUnit = z.enum(['celsius', 'fahrenheit']);

/**
 * The routes a model may call, over MCP or while the assistant streams a reply.
 * Each is an ordinary route, so an HTTP caller reaches it the same way.
 */
export const assistantTools = k.routes('assistant', {
    getForecast: k
        .route({
            method: 'GET',
            path: '/forecast/:city',
            auth: false,
            pathParams: z.object({
                city: z.string().min(1),
            }),
            query: z.object({
                unit: TemperatureUnit.default('celsius'),
            }),
            responses: {
                200: z.object({
                    temperature: z.number(),
                    unit: TemperatureUnit,
                    summary: z.string(),
                }),
            },
            summary: 'Look up tomorrow forecast for one city',
            tool: {
                title: 'Weather forecast',
                openWorldHint: true,
            },
        })
        .handler(({ params, query }) => ({
            status: 200,
            body: forecastFor(params.city, query.unit),
        })),
    plotSignups: k
        .route({
            method: 'GET',
            path: '/signups',
            auth: false,
            query: z.object({
                days: z.int().min(1).max(90),
            }),
            responses: {
                200: z.object({
                    points: z.array(
                        z.object({
                            date: z.string(),
                            signups: z.int(),
                        })
                    ),
                }),
            },
            summary: 'Plot signups per day over the last N days, for the client to draw as a chart',
            tool: true,
        })
        .handler(({ query }) => ({
            status: 200,
            body: {
                points: signupsOverDays(query.days),
            },
        })),
    countWords: k
        .route({
            method: 'POST',
            path: '/text/word-count',
            auth: false,
            body: z.object({
                text: z.string(),
            }),
            responses: {
                200: z.object({
                    words: z.int(),
                }),
            },
            summary: 'Count the words in a piece of text',
            tool: {
                readOnlyHint: true,
            },
        })
        .handler(({ body }) => ({
            status: 200,
            body: {
                words: countWords(body.text),
            },
        })),
});
