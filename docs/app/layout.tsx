import { RootProvider } from 'fumadocs-ui/provider/next';

import { Plus_Jakarta_Sans } from 'next/font/google';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { siteUrl } from '@/lib/site';

import './global.css';
import './tokens.css';

import styles from './layout.module.css';

const plusJakartaSans = Plus_Jakarta_Sans({
    subsets: ['latin'],
    variable: '--font-plus-jakarta',
    display: 'swap',
});

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: 'Kizuna.js',
        template: '%s | Kizuna.js',
    },
    openGraph: {
        type: 'website',
        siteName: 'Kizuna.js',
        url: '/',
        images: [
            {
                url: '/open-graph.jpg',
                width: 1200,
                height: 630,
                alt: 'Kizuna.js',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        images: ['/open-graph.jpg'],
    },
    icons: [
        {
            rel: 'icon',
            url: '/favicon-dark.png',
            media: '(prefers-color-scheme: light)',
        },
        {
            rel: 'icon',
            url: '/favicon-light.png',
            media: '(prefers-color-scheme: dark)',
        },
    ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={`${plusJakartaSans.variable} dark`} style={{ colorScheme: 'dark' }} suppressHydrationWarning>
            <body className={styles.body}>
                <RootProvider
                    theme={{
                        forcedTheme: 'dark',
                        defaultTheme: 'dark',
                        enableSystem: false,
                    }}>
                    {children}
                </RootProvider>
            </body>
        </html>
    );
}
