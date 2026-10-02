import { defineRelationship } from '@kizunajs/cms';
import { ProductId } from '../models';
import { apiClient } from '../lib/api-client';

/**
 * Products live in the app API. Pages hold their ids, and the editor's picker
 * lists them through the app's own route, as the editor.
 */
export const Products = defineRelationship({
    name: 'products',
    id: ProductId,
    options: async ({ query, ids, headers }) => {
        const result = await apiClient.products.listProductOptions({
            query: {
                q: query,
                ids,
            },
            headers,
        });
        return result.status === 200 ? result.body.options : [];
    },
});
