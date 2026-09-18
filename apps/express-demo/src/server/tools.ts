import type { ToolHandlers, ToolsOf } from '@ts-kizuna/core';
import { contract } from '@ts-kizuna-demo/shared';
import { countWords, forecastFor, signupsOverDays } from '@ts-kizuna-demo/shared';

export const toolHandlers: ToolHandlers<ToolsOf<typeof contract>> = {
    weather: {
        getForecast: ({ input, throwError }) => {
            if (input.city.trim() === '') {
                throwError('Name a city to look the forecast up for.');
            }
            return forecastFor(input.city, input.unit);
        },
    },

    charts: {
        plotSignups: ({ input }) => ({
            points: signupsOverDays(input.days),
        }),
    },

    countWords: ({ input }) => ({
        words: countWords(input.text),
    }),
};
