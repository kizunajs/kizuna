import config from '../../../../kizuna.config';

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = config.api.mount({
    basePath: '/api',
});
