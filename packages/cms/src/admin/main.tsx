import { createRoot } from 'react-dom/client';
import { Admin } from './admin.js';
import type { AdminConfig } from './config.js';

const readConfig = (): AdminConfig => {
    try {
        return JSON.parse(window.document.getElementById('kizuna-cms-config')?.textContent ?? '') as AdminConfig;
    } catch {
        return {
            siteUrl: null,
            apiPath: '/api',
            role: null,
            signOutPath: null,
            routes: {},
            groups: {},
            lists: {},
        };
    }
};

createRoot(window.document.getElementById('root')!).render(<Admin config={readConfig()} />);
