import kizuna from '../../../../kizuna.cms.config';

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = kizuna.api.mount({
    basePath: '/cms-api',
});
