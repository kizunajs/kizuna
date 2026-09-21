import { defineConfig } from 'kizunajs';
import { routes } from '@/routes';

export default defineConfig({
    routes: {
        users: routes,
    },
});
