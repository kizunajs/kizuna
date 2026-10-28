import { createRoot } from 'react-dom/client';
import { Toast } from '@base-ui/react/toast';
import { Tooltip } from '@base-ui/react/tooltip';
import { Admin } from './admin.js';
import type { AdminConfig } from './config.js';
import { Toasts } from './toasts.js';

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

createRoot(window.document.getElementById('root')!).render(
    <Toast.Provider>
        <Tooltip.Provider>
            <Admin config={readConfig()} />
            <Toasts />
        </Tooltip.Provider>
    </Toast.Provider>
);
