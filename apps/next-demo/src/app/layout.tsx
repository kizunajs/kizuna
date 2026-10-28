import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Fraunces } from 'next/font/google';
import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizuna-config';
import { Header } from '../components/site/Header';
import { Footer } from '../components/site/Footer';
import './globals.css';

const sans = localFont({
    src: './fonts/plus-jakarta-sans-latin.woff2',
    weight: '200 800',
    variable: '--font-sans',
    display: 'swap',
});

const serif = Fraunces({
    subsets: ['latin'],
    style: ['normal', 'italic'],
    axes: ['opsz', 'SOFT'],
    variable: '--font-serif',
    display: 'swap',
});

export const metadata: Metadata = {
    title: {
        default: 'Hagen',
        template: '%s | Hagen',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${sans.variable} ${serif.variable}`}>
            <body>
                <Header />
                {children}
                <Footer />
                <KizunaPreview content={kizuna.content} />
            </body>
        </html>
    );
}
