import { Kizuna } from 'kizunajs';
import { CoercedQuery, NestedCoerced } from './shared-schemas.js';

const k = new Kizuna();

export const routes = k.routes({
    a: k.route({
        method: 'GET',
        path: '/a',
        query: CoercedQuery,
        responses: {},
    }),
    d: k.route({
        method: 'GET',
        path: '/d',
        query: NestedCoerced,
        responses: {},
    }),
});
