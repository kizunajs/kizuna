import { Kizuna } from '@ts-kizuna/core';
import { CleanQuery } from './shared-schemas.js';

const k = new Kizuna();

export const routes = k.routes({
    a: k.route({
        method: 'GET',
        path: '/a',
        query: CleanQuery,
        responses: {},
    }),
});
