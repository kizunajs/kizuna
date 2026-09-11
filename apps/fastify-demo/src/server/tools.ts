import { countWords, forecastFor, signupsOverDays } from '@ts-kizuna-demo/shared';
import { server } from './server';

export const toolHandlers = server.tools({
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
});
