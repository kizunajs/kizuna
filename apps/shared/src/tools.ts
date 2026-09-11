import { z } from 'zod';
import { k } from './k';

const TemperatureUnit = z.enum(['celsius', 'fahrenheit']);

/**
 * The tools the assistant may call while it streams a reply. They are also
 * published as MCP tools, so the same declaration serves both.
 */
export const tools = k.tools({
    weather: {
        getForecast: {
            title: 'Weather forecast',
            description: 'Look up tomorrow forecast for one city',
            input: z.object({
                city: z.string().min(1),
                unit: TemperatureUnit.default('celsius'),
            }),
            output: z.object({
                temperature: z.number(),
                unit: TemperatureUnit,
                summary: z.string(),
            }),
            annotations: {
                readOnlyHint: true,
            },
        },
    },
    charts: {
        plotSignups: {
            title: 'Signup chart',
            description: 'Plot signups per day over the last N days, for the client to draw as a chart',
            input: z.object({
                days: z.int().min(1).max(90),
            }),
            output: z.object({
                points: z.array(
                    z.object({
                        date: z.string(),
                        signups: z.int(),
                    })
                ),
            }),
            annotations: {
                readOnlyHint: true,
            },
        },
    },
    countWords: {
        description: 'Count the words in a piece of text',
        input: z.object({
            text: z.string(),
        }),
        output: z.object({
            words: z.int(),
        }),
        annotations: {
            readOnlyHint: true,
        },
    },
});
