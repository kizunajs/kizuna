import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import { DocumentView } from './document.js';
import { listenToHost } from './host.js';

/**
 * What the server writes into the page when it serves it.
 */
interface ViewConfig {
    siteUrl: string | null;
}

const readConfig = (): ViewConfig => {
    try {
        return JSON.parse(window.document.getElementById('kizuna-cms-config')?.textContent ?? '') as ViewConfig;
    } catch {
        return {
            siteUrl: null,
        };
    }
};

const app = new App(
    {
        name: 'Kizuna CMS',
        version: '1.0.0',
    },
    {
        availableDisplayModes: ['inline', 'fullscreen'],
    },
    {
        autoResize: true,
    }
);

const events = listenToHost(app);

void app.connect().finally(() => {
    createRoot(window.document.getElementById('root')!).render(<DocumentView app={app} events={events} siteUrl={readConfig().siteUrl} />);
});
