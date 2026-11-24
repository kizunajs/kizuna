import { defineConfig } from '@kizunajs/tooling';

export default defineConfig({
    pullRequests: {
        squash: true,
        scopes: ['adapters', 'clients', 'jobs', 'native-clients'],
    },
});
