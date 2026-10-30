import { createRoot } from 'react-dom/client';
import { Toast } from '@base-ui/react/toast';
import { Tooltip } from '@base-ui/react/tooltip';
import { Admin } from './admin.js';
import type { AdminConfig } from './config.js';
import { addressOfHash, setAdminPath } from './navigation.js';
import { Toasts } from './toasts.js';

const readConfig = (): AdminConfig => {
    try {
        return JSON.parse(window.document.getElementById('kizuna-cms-config')?.textContent ?? '') as AdminConfig;
    } catch {
        return {
            siteUrl: null,
            apiPath: '/api',
            adminPath: '/admin',
            role: null,
            signOutPath: null,
            routes: {},
            groups: {},
            lists: {},
        };
    }
};

const config = readConfig();
setAdminPath(config.adminPath);
// A link from before screens had paths, like `/admin#/collections/employees`, moves to the path once.
const moved = addressOfHash(window.location.hash);
if (moved !== undefined) window.history.replaceState(null, '', moved);

createRoot(window.document.getElementById('root')!).render(
    <Toast.Provider>
        <Tooltip.Provider>
            <Admin config={config} />
            <Toasts />
        </Tooltip.Provider>
    </Toast.Provider>
);
