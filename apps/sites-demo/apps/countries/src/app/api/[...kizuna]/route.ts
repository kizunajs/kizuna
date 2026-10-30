import kizuna from '@kizunajs-demo/sites-content/config';

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = kizuna.api.mount({
    basePath: '/api',
});
