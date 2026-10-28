import { createRoot } from 'react-dom/client';
import type { SignInConfig } from './sign-in-config.js';
import { SignIn } from './sign-in.js';

const readConfig = (): SignInConfig => {
    try {
        return JSON.parse(window.document.getElementById('kizuna-cms-config')?.textContent ?? '') as SignInConfig;
    } catch {
        return {
            signInPath: '/api/sign-in',
            next: '/',
            noAccess: false,
        };
    }
};

createRoot(window.document.getElementById('root')!).render(<SignIn config={readConfig()} />);
